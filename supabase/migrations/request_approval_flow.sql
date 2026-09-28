-- ── Request → approve → send access details ─────────────────────────────────
-- Creators request a current; the business approves (sending free-text access
-- details: a code, "you're on the list", a ticket link…) or declines.
-- Unanswered requests expire after 48h (expire-requests cron function).

-- 1) Allowed statuses (drop whatever CHECK currently guards redemptions.status)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'redemptions'::regclass AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE redemptions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE redemptions ADD CONSTRAINT redemptions_status_check CHECK (status IN (
  'requested', 'approved', 'declined', 'expired', 'cancelled',
  'claimed', 'checked_in', 'completed'
));

-- 2) New columns
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS access_details TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- 3) Existing claims already had access → approved
UPDATE redemptions
   SET status = 'approved',
       requested_at = COALESCE(requested_at, claimed_at),
       responded_at = COALESCE(responded_at, claimed_at)
 WHERE status = 'claimed';

-- 4) Codes are no longer auto-assigned on claim
DROP FUNCTION IF EXISTS assign_circuit_code() CASCADE;

-- 5) Business approves/declines. Enforces ownership + capacity server-side.
CREATE OR REPLACE FUNCTION respond_to_request(
  p_redemption_id UUID,
  p_approve BOOLEAN,
  p_details TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_circuit circuits%ROWTYPE;
  v_status  TEXT;
  v_filled  INT;
BEGIN
  SELECT r.status INTO v_status FROM redemptions r WHERE r.id = p_redemption_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;

  -- Lock the circuit so two approvals can't both take the last spot.
  SELECT ci.* INTO v_circuit
    FROM circuits ci JOIN redemptions r ON r.circuit_id = ci.id
   WHERE r.id = p_redemption_id
   FOR UPDATE OF ci;

  IF NOT EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = v_circuit.business_id AND b.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_status <> 'requested' THEN
    RAISE EXCEPTION 'This request was already %', v_status;
  END IF;

  IF NOT p_approve THEN
    UPDATE redemptions SET status = 'declined', responded_at = now() WHERE id = p_redemption_id;
    RETURN 'declined';
  END IF;

  IF p_details IS NULL OR btrim(p_details) = '' THEN
    RAISE EXCEPTION 'Please add access details for the creator';
  END IF;

  SELECT count(*) INTO v_filled FROM redemptions
   WHERE circuit_id = v_circuit.id AND status IN ('approved', 'checked_in', 'completed');

  IF v_circuit.max_redemptions IS NOT NULL AND v_filled >= v_circuit.max_redemptions THEN
    RAISE EXCEPTION 'All spots are already filled';
  END IF;

  UPDATE redemptions
     SET status = 'approved', access_details = btrim(p_details), responded_at = now()
   WHERE id = p_redemption_id;

  IF v_circuit.max_redemptions IS NOT NULL AND v_filled + 1 >= v_circuit.max_redemptions THEN
    UPDATE circuits SET is_active = false WHERE id = v_circuit.id;
  END IF;

  RETURN 'approved';
END;
$$;

GRANT EXECUTE ON FUNCTION respond_to_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- 5b) Creator withdraws a pending or approved request. If that frees a spot
--     on a current that closed because it was full, reopen it.
CREATE OR REPLACE FUNCTION withdraw_request(p_redemption_id UUID) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_circuit_id UUID;
  v_status     TEXT;
  v_max        INT;
  v_filled     INT;
  v_expires    TIMESTAMPTZ;
BEGIN
  SELECT r.circuit_id, r.status INTO v_circuit_id, v_status
    FROM redemptions r
    JOIN creators c ON c.id = r.creator_id
   WHERE r.id = p_redemption_id AND c.profile_id = auth.uid();
  IF v_circuit_id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_status NOT IN ('requested', 'approved', 'claimed') THEN
    RAISE EXCEPTION 'This request can no longer be withdrawn';
  END IF;

  UPDATE redemptions SET status = 'cancelled' WHERE id = p_redemption_id;

  IF v_status IN ('approved', 'claimed') THEN
    SELECT max_redemptions, expires_at INTO v_max, v_expires FROM circuits WHERE id = v_circuit_id FOR UPDATE;
    SELECT count(*) INTO v_filled FROM redemptions
     WHERE circuit_id = v_circuit_id AND status IN ('approved', 'checked_in', 'completed', 'claimed');
    -- Only reopen if it was full a moment ago (not if the business paused it).
    IF v_max IS NOT NULL AND v_filled = v_max - 1 AND (v_expires IS NULL OR v_expires > now()) THEN
      UPDATE circuits SET is_active = true WHERE id = v_circuit_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_request(UUID) TO authenticated;

-- 6) Guard: app users can't approve/decline/expire themselves or set details.
--    respond_to_request (SECURITY DEFINER) and server jobs (service_role) bypass.
CREATE OR REPLACE FUNCTION guard_redemption_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'requested';
    NEW.access_details := NULL;
    NEW.responded_at := NULL;
    NEW.requested_at := now();
    RETURN NEW;
  END IF;
  IF NEW.access_details IS DISTINCT FROM OLD.access_details
     OR NEW.responded_at IS DISTINCT FROM OLD.responded_at THEN
    RAISE EXCEPTION 'Not allowed to change request details';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status IN ('requested', 'approved', 'claimed') AND NEW.status = 'cancelled')
    OR (OLD.status IN ('approved', 'claimed') AND NEW.status = 'checked_in')
    OR (OLD.status IN ('approved', 'claimed', 'checked_in') AND NEW.status = 'completed')
  ) THEN
    RAISE EXCEPTION 'Not allowed to change status from % to %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_redemption_status ON redemptions;
CREATE TRIGGER guard_redemption_status
  BEFORE INSERT OR UPDATE ON redemptions
  FOR EACH ROW EXECUTE FUNCTION guard_redemption_status();

-- 7) Security fix: unassigned codes were readable by any signed-in user.
DROP POLICY IF EXISTS "circuit_codes_select_own" ON circuit_codes;
CREATE POLICY "circuit_codes_select_own" ON circuit_codes
  FOR SELECT USING (
    auth.uid() IN (
      SELECT c.profile_id FROM creators c
      JOIN redemptions r ON r.creator_id = c.id
      WHERE r.id = circuit_codes.redemption_id
    )
  );

NOTIFY pgrst, 'reload schema';
