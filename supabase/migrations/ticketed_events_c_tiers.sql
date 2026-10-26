-- ── Ticketed events, PART C: staged tier access ─────────────────────────────
-- Larger accounts get first access; each smaller follower tier opens 24h later.
-- Mirrors currentThreshold() in src/lib/eligibility.ts and the
-- notify-new-circuit function. Adds the server-side check to claim_current and
-- a column so tier-opening notifications are only sent once.

-- 1) Lowest follower count already notified for this current
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS notified_threshold INTEGER;

-- 2) Follower count currently allowed to claim
--    Stages: 150K, 100K, 50K, 25K, 10K, 5K, 0 (only those ≥ the minimum),
--    stepping down one per 24h since the current was created.
CREATE OR REPLACE FUNCTION current_tier_threshold(p_min INT, p_created TIMESTAMPTZ) RETURNS INT
LANGUAGE sql STABLE AS $$
  WITH stages AS (
    SELECT v, row_number() OVER (ORDER BY v DESC) - 1 AS idx
      FROM unnest(ARRAY[150000, 100000, 50000, 25000, 10000, 5000, 0]) AS v
     WHERE v >= p_min
  )
  SELECT coalesce(
    (SELECT v FROM stages
      WHERE idx = LEAST(
        GREATEST(floor(extract(epoch FROM now() - coalesce(p_created, now())) / 86400)::int, 0),
        (SELECT count(*) - 1 FROM stages)::int)),
    p_min);
$$;

-- 3) A creator's best follower count on the allowed platform(s):
--    verified (OAuth) count, else the floor of their self-reported tier.
CREATE OR REPLACE FUNCTION creator_best_count(p_creator_id UUID, p_platform TEXT) RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c      creators%ROWTYPE;
  v_best INT;
  v_n    INT;
  p      TEXT;
  tier   TEXT;
BEGIN
  SELECT * INTO c FROM creators WHERE id = p_creator_id;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  FOREACH p IN ARRAY CASE WHEN p_platform IN ('tiktok', 'instagram') THEN ARRAY[p_platform]
                          ELSE ARRAY['tiktok', 'instagram'] END LOOP
    SELECT follower_count INTO v_n FROM social_connections
     WHERE profile_id = c.profile_id AND platform = p AND connection_type = 'oauth'
     LIMIT 1;
    IF v_n IS NULL THEN
      tier := CASE WHEN lower(c.main_platform) = p THEN c.follower_range
                   WHEN lower(c.secondary_platform) = p THEN c.secondary_follower_range END;
      v_n := CASE tier WHEN 'Under 1K' THEN 0 WHEN '1K–5K' THEN 1000 WHEN '5K–10K' THEN 5000
                       WHEN '10K–50K' THEN 10000 WHEN '50K–100K' THEN 50000 WHEN '100K+' THEN 100000 END;
    END IF;
    IF v_n IS NOT NULL AND (v_best IS NULL OR v_n > v_best) THEN v_best := v_n; END IF;
  END LOOP;
  RETURN v_best;
END;
$$;

-- 4) Claim, now also enforcing verification, the minimum and the open tier
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
  v_status     TEXT;
  v_best       INT;
BEGIN
  SELECT id, status INTO v_creator_id, v_status FROM creators WHERE profile_id = auth.uid();
  IF v_creator_id IS NULL THEN RAISE EXCEPTION 'Only creators can claim tickets'; END IF;
  IF v_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Your account is still being verified'; END IF;

  SELECT * INTO v_circuit FROM circuits WHERE id = p_circuit_id FOR UPDATE;
  IF v_circuit.id IS NULL OR NOT v_circuit.is_active THEN
    RAISE EXCEPTION 'This current is no longer available';
  END IF;
  IF v_circuit.event_at IS NOT NULL AND v_circuit.event_at < now() THEN
    RAISE EXCEPTION 'This event has already happened';
  END IF;
  IF v_circuit.min_followers IS NOT NULL THEN
    v_best := creator_best_count(v_creator_id, v_circuit.required_platform);
    IF v_best IS NULL OR v_best < v_circuit.min_followers THEN
      RAISE EXCEPTION 'You don''t meet the follower minimum for this current';
    END IF;
    IF v_best < current_tier_threshold(v_circuit.min_followers, v_circuit.created_at) THEN
      RAISE EXCEPTION 'This current opens to your follower tier soon';
    END IF;
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

-- 5) Hourly: notify each tier as it opens
--    (needs the updated notify-new-circuit function deployed)
SELECT cron.schedule(
  'notify-tier-openings-hourly',
  '7 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pxncnpuzgdmlsaxgrxkq.supabase.co/functions/v1/notify-new-circuit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CRON_SECRET_VALUE'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

NOTIFY pgrst, 'reload schema';
