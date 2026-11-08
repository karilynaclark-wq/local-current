-- ── "You pick" schedules ─────────────────────────────────────────────────────
-- One-time events store their date in circuits.event_at (already exists).
-- Recurring / multi-date events: the business may add a preference note;
-- creators pick up to 3 dates when they tap "I'm interested"; the business
-- picks one of those when approving (redemptions.going_on).

ALTER TABLE circuits ADD COLUMN IF NOT EXISTS schedule_type TEXT
  CHECK (schedule_type IN ('one_time', 'recurring'));
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS schedule_note TEXT;

ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS preferred_dates DATE[];
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS preference_note TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS going_on DATE;

-- Creator: "I'm interested" (+ dates for recurring events)
DROP FUNCTION IF EXISTS request_current(UUID);
CREATE OR REPLACE FUNCTION request_current(p_circuit_id UUID, p_dates DATE[] DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_circuit circuits%ROWTYPE;
  v_creator UUID;
  v_status  TEXT;
  v_best    INT;
  v_red     redemptions%ROWTYPE;
  v_dates   DATE[];
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

  IF v_circuit.schedule_type = 'recurring' THEN
    SELECT array_agg(DISTINCT d ORDER BY d) INTO v_dates FROM unnest(p_dates) d WHERE d >= current_date;
    IF v_dates IS NULL OR array_length(v_dates, 1) = 0 THEN RAISE EXCEPTION 'Pick at least one date that works for you'; END IF;
    IF array_length(v_dates, 1) > 3 THEN RAISE EXCEPTION 'Pick up to 3 dates'; END IF;
  END IF;

  SELECT * INTO v_red FROM redemptions WHERE circuit_id = p_circuit_id AND creator_id = v_creator;
  IF v_red.id IS NOT NULL THEN
    IF v_red.status = 'cancelled' THEN
      UPDATE redemptions SET status = 'requested', requested_at = now(), responded_at = NULL,
        delivery_method = NULL, code = NULL, confirmed_at = NULL, going_on = NULL,
        preferred_dates = v_dates, preference_note = nullif(btrim(p_note), '')
       WHERE id = v_red.id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'You already asked for this event';
  END IF;

  INSERT INTO redemptions (circuit_id, creator_id, status, requested_at, preferred_dates, preference_note)
  VALUES (p_circuit_id, v_creator, 'requested', now(), v_dates, nullif(btrim(p_note), ''));
END $$;
GRANT EXECUTE ON FUNCTION request_current(UUID, DATE[], TEXT) TO authenticated;

-- Business: approve (+ the date they're going, for recurring events)
DROP FUNCTION IF EXISTS approve_request(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION approve_request(p_redemption_id UUID, p_method TEXT, p_code TEXT DEFAULT NULL, p_going DATE DEFAULT NULL)
RETURNS TEXT
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
  IF v_circuit.schedule_type = 'recurring' THEN
    IF p_going IS NULL THEN RAISE EXCEPTION 'Pick the date they''re going'; END IF;
    IF v_red.preferred_dates IS NOT NULL AND NOT (p_going = ANY (v_red.preferred_dates)) THEN
      RAISE EXCEPTION 'Pick one of the dates they chose';
    END IF;
  END IF;

  SELECT count(*) INTO v_filled FROM redemptions
   WHERE circuit_id = v_circuit.id AND status IN ('approved', 'claimed', 'checked_in', 'completed');
  IF v_circuit.max_redemptions IS NOT NULL AND v_filled >= v_circuit.max_redemptions THEN
    RAISE EXCEPTION 'All spots are filled';
  END IF;

  UPDATE redemptions SET status = 'approved', responded_at = now(), claimed_at = now(),
    delivery_method = p_method, code = CASE WHEN p_method = 'code' THEN btrim(p_code) END, confirmed_at = NULL,
    going_on = CASE WHEN v_circuit.schedule_type = 'recurring' THEN p_going
                    WHEN v_circuit.event_at IS NOT NULL THEN (v_circuit.event_at AT TIME ZONE 'America/Chicago')::date END
   WHERE id = p_redemption_id;

  IF p_method <> 'code' THEN
    SELECT u.email INTO v_email FROM creators c JOIN auth.users u ON u.id = c.profile_id WHERE c.id = v_red.creator_id;
  END IF;
  RETURN v_email;
END $$;
GRANT EXECUTE ON FUNCTION approve_request(UUID, TEXT, TEXT, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
