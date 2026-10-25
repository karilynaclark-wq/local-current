-- ── Ticketed events, PART A (safe to run any time) ──────────────────────────
-- Additive only: new columns + the claim_current RPC. The App Store version
-- (request → approve flow) keeps working, so the new build can be tested now.
-- Run ticketed_events_b_cutover.sql once the new build is live.
-- Every current is now an event. The business gives each creator 2 tickets
-- (creator + friend) and uploads either one shared promo code or a list of
-- unique codes. Creators claim instantly via claim_current(), which copies the
-- code onto their redemption. Codes live in circuit_codes (never readable by
-- creators directly), so the shared code isn't exposed to non-claimers.

-- 1) New columns
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ;
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS code_mode TEXT
  CHECK (code_mode IN ('shared', 'list'));

-- 2) Claim: checks eligibility-independent rules server-side and hands out a code.
CREATE OR REPLACE FUNCTION claim_current(p_circuit_id UUID) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_circuit    circuits%ROWTYPE;
  v_creator_id UUID;
  v_filled     INT;
  v_code_id    UUID;
  v_code       TEXT;
  v_red_id     UUID;
BEGIN
  SELECT id INTO v_creator_id FROM creators WHERE profile_id = auth.uid();
  IF v_creator_id IS NULL THEN RAISE EXCEPTION 'Only creators can claim tickets'; END IF;

  SELECT * INTO v_circuit FROM circuits WHERE id = p_circuit_id FOR UPDATE;
  IF v_circuit.id IS NULL OR NOT v_circuit.is_active THEN
    RAISE EXCEPTION 'This current is no longer available';
  END IF;
  IF v_circuit.event_at IS NOT NULL AND v_circuit.event_at < now() THEN
    RAISE EXCEPTION 'This event has already happened';
  END IF;
  SELECT id INTO v_red_id FROM redemptions
   WHERE circuit_id = p_circuit_id AND creator_id = v_creator_id;
  IF v_red_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM redemptions WHERE id = v_red_id
       AND status NOT IN ('cancelled', 'expired', 'declined', 'requested')
  ) THEN
    RAISE EXCEPTION 'You already claimed this current';
  END IF;

  SELECT count(*) INTO v_filled FROM redemptions
   WHERE circuit_id = p_circuit_id AND status IN ('approved', 'claimed', 'checked_in', 'completed');
  IF v_circuit.max_redemptions IS NOT NULL AND v_filled >= v_circuit.max_redemptions THEN
    RAISE EXCEPTION 'No tickets left';
  END IF;

  IF v_circuit.code_mode = 'list' THEN
    SELECT id, code INTO v_code_id, v_code FROM circuit_codes
     WHERE circuit_id = p_circuit_id AND redemption_id IS NULL AND NOT coalesce(is_used, false)
     ORDER BY created_at
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
  ELSE
    SELECT id, code INTO v_code_id, v_code FROM circuit_codes
     WHERE circuit_id = p_circuit_id
     ORDER BY created_at
     LIMIT 1;
    v_code_id := NULL; -- shared code is never assigned to one creator
  END IF;
  IF v_code IS NULL THEN RAISE EXCEPTION 'No tickets left'; END IF;

  -- Reuse an earlier withdrawn/old request row (unique per circuit + creator).
  IF v_red_id IS NOT NULL THEN
    UPDATE redemptions
       SET status = 'approved', code = v_code, claimed_at = now(),
           requested_at = now(), responded_at = now(), access_details = NULL
     WHERE id = v_red_id;
  ELSE
    INSERT INTO redemptions (circuit_id, creator_id, status, code, claimed_at, requested_at, responded_at)
    VALUES (p_circuit_id, v_creator_id, 'approved', v_code, now(), now(), now())
    RETURNING id INTO v_red_id;
  END IF;

  IF v_code_id IS NOT NULL THEN
    UPDATE circuit_codes SET redemption_id = v_red_id, is_used = true WHERE id = v_code_id;
  END IF;

  IF v_circuit.max_redemptions IS NOT NULL AND v_filled + 1 >= v_circuit.max_redemptions THEN
    UPDATE circuits SET is_active = false WHERE id = p_circuit_id;
  END IF;

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_current(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
