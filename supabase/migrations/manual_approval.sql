-- ── Manual approval currents ────────────────────────────────────────────────
-- A current is either 'instant' (claim → code right away, unchanged) or
-- 'manual': creators tap "I'm interested" before a deadline, the business
-- approves/passes, and picks how each approved creator gets tickets:
--   code       → business types a promo code (shown to the creator)
--   guest_list → business adds them to the door list (creator's name shown)
--   email      → business emails the tickets
-- For guest_list/email the business sees the creator's email after approval.
-- Approved creators tap "Got it!" within 72 hours or the tickets are released
-- (hourly job in send-email). Unpicked requests close when the event starts.

ALTER TABLE circuits ADD COLUMN IF NOT EXISTS approval_mode TEXT NOT NULL DEFAULT 'instant'
  CHECK (approval_mode IN ('instant', 'manual'));
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS request_deadline TIMESTAMPTZ;
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS deadline_notified TIMESTAMPTZ;

ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS delivery_method TEXT
  CHECK (delivery_method IN ('code', 'guest_list', 'email'));
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Instant claims can't be used on manual currents
CREATE OR REPLACE FUNCTION block_claim_on_manual() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.delivery_method IS NULL
     AND EXISTS (SELECT 1 FROM circuits WHERE id = NEW.circuit_id AND approval_mode = 'manual')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    RAISE EXCEPTION 'This event picks creators. Tap "I''m interested" instead.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS block_claim_on_manual ON redemptions;
CREATE TRIGGER block_claim_on_manual BEFORE INSERT OR UPDATE ON redemptions
  FOR EACH ROW EXECUTE FUNCTION block_claim_on_manual();

-- Creator: "I'm interested"
CREATE OR REPLACE FUNCTION request_current(p_circuit_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_circuit circuits%ROWTYPE;
  v_creator UUID;
  v_status  TEXT;
  v_best    INT;
  v_red     redemptions%ROWTYPE;
BEGIN
  SELECT id, status INTO v_creator, v_status FROM creators WHERE profile_id = auth.uid();
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Only creators can request tickets'; END IF;
  IF v_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Your account is still being verified'; END IF;

  SELECT * INTO v_circuit FROM circuits WHERE id = p_circuit_id;
  IF v_circuit.id IS NULL OR NOT v_circuit.is_active THEN RAISE EXCEPTION 'This event is no longer available'; END IF;
  IF v_circuit.approval_mode <> 'manual' THEN RAISE EXCEPTION 'Claim this event instead'; END IF;
  IF v_circuit.request_deadline IS NOT NULL AND v_circuit.request_deadline < now() THEN
    RAISE EXCEPTION 'The deadline to ask for tickets has passed';
  END IF;
  IF v_circuit.event_at IS NOT NULL AND v_circuit.event_at < now() THEN
    RAISE EXCEPTION 'This event has already happened';
  END IF;
  IF v_circuit.min_followers IS NOT NULL THEN
    v_best := creator_best_count(v_creator, v_circuit.required_platform);
    IF v_best IS NULL OR v_best < v_circuit.min_followers THEN
      RAISE EXCEPTION 'You don''t meet the follower minimum for this event';
    END IF;
  END IF;

  SELECT * INTO v_red FROM redemptions WHERE circuit_id = p_circuit_id AND creator_id = v_creator;
  IF v_red.id IS NOT NULL THEN
    IF v_red.status = 'cancelled' THEN
      UPDATE redemptions SET status = 'requested', requested_at = now(), responded_at = NULL,
        delivery_method = NULL, code = NULL, confirmed_at = NULL WHERE id = v_red.id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'You already asked for this event';
  END IF;

  INSERT INTO redemptions (circuit_id, creator_id, status, requested_at)
  VALUES (p_circuit_id, v_creator, 'requested', now());
END $$;
GRANT EXECUTE ON FUNCTION request_current(UUID) TO authenticated;

-- Business: approve, choosing how the creator gets tickets
CREATE OR REPLACE FUNCTION approve_request(p_redemption_id UUID, p_method TEXT, p_code TEXT DEFAULT NULL)
RETURNS TEXT  -- the creator's email for guest_list/email, else NULL
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_circuit circuits%ROWTYPE;
  v_red     redemptions%ROWTYPE;
  v_filled  INT;
  v_email   TEXT;
BEGIN
  IF p_method NOT IN ('code', 'guest_list', 'email') THEN RAISE EXCEPTION 'Pick how they''ll get tickets'; END IF;
  IF p_method = 'code' AND coalesce(btrim(p_code), '') = '' THEN RAISE EXCEPTION 'Add the ticket code'; END IF;

  SELECT * INTO v_red FROM redemptions WHERE id = p_redemption_id;
  IF v_red.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT * INTO v_circuit FROM circuits WHERE id = v_red.circuit_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = v_circuit.business_id AND profile_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_red.status <> 'requested' THEN RAISE EXCEPTION 'This request was already %', v_red.status; END IF;

  SELECT count(*) INTO v_filled FROM redemptions
   WHERE circuit_id = v_circuit.id AND status IN ('approved', 'claimed', 'checked_in', 'completed');
  IF v_circuit.max_redemptions IS NOT NULL AND v_filled >= v_circuit.max_redemptions THEN
    RAISE EXCEPTION 'All spots are filled';
  END IF;

  UPDATE redemptions SET status = 'approved', responded_at = now(), claimed_at = now(),
    delivery_method = p_method, code = CASE WHEN p_method = 'code' THEN btrim(p_code) END, confirmed_at = NULL
   WHERE id = p_redemption_id;

  IF p_method <> 'code' THEN
    SELECT u.email INTO v_email FROM creators c JOIN auth.users u ON u.id = c.profile_id WHERE c.id = v_red.creator_id;
  END IF;
  RETURN v_email;
END $$;
GRANT EXECUTE ON FUNCTION approve_request(UUID, TEXT, TEXT) TO authenticated;

-- Business: pass
CREATE OR REPLACE FUNCTION pass_request(p_redemption_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE redemptions r SET status = 'declined', responded_at = now()
    FROM circuits ci JOIN businesses b ON b.id = ci.business_id
   WHERE r.id = p_redemption_id AND ci.id = r.circuit_id AND b.profile_id = auth.uid() AND r.status = 'requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pass_request(UUID) TO authenticated;

-- Creator: "Got it!"
CREATE OR REPLACE FUNCTION confirm_tickets(p_redemption_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE redemptions r SET confirmed_at = now()
    FROM creators c
   WHERE r.id = p_redemption_id AND c.id = r.creator_id AND c.profile_id = auth.uid() AND r.status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'These tickets are no longer available'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION confirm_tickets(UUID) TO authenticated;

-- Business: emails of approved creators (guest list / email delivery only)
CREATE OR REPLACE FUNCTION approved_creator_emails(p_circuit_id UUID)
RETURNS TABLE (redemption_id UUID, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, u.email::TEXT
    FROM redemptions r
    JOIN circuits ci ON ci.id = r.circuit_id
    JOIN businesses b ON b.id = ci.business_id
    JOIN creators c ON c.id = r.creator_id
    JOIN auth.users u ON u.id = c.profile_id
   WHERE r.circuit_id = p_circuit_id AND b.profile_id = auth.uid()
     AND r.delivery_method IN ('guest_list', 'email')
     AND r.status IN ('approved', 'claimed', 'checked_in', 'completed');
$$;
GRANT EXECUTE ON FUNCTION approved_creator_emails(UUID) TO authenticated;

-- Approval → send-email ('approved'); fires for manual approvals only.
CREATE OR REPLACE FUNCTION trg_email_redemption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('approved', 'claimed')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM email_event(CASE WHEN NEW.delivery_method IS NOT NULL THEN 'approved' ELSE 'claim' END, NEW.id);
  END IF;
  IF NEW.problem_reported_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.problem_reported_at IS DISTINCT FROM NEW.problem_reported_at) THEN
    PERFORM email_event('problem', NEW.id);
  END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
