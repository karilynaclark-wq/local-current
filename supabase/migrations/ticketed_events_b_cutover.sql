-- ── Ticketed events, PART B (cutover) ───────────────────────────────────────
-- Run only AFTER the ticketed-events app update is live in the App Store.
-- Blocks the old request flow, hides currents without a ticket code, and
-- closes out pending requests.

-- 1) Hide existing currents that have no ticket code
UPDATE circuits ci SET is_active = false
 WHERE ci.code_mode IS NULL
   AND NOT EXISTS (SELECT 1 FROM circuit_codes cc WHERE cc.circuit_id = ci.id);

-- 2) Guard: app users can no longer insert redemptions directly (claims go
--    through claim_current) and can't change the code.
CREATE OR REPLACE FUNCTION guard_redemption_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Claim tickets from the app';
  END IF;
  IF NEW.access_details IS DISTINCT FROM OLD.access_details
     OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
     OR NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Not allowed to change claim details';
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

-- 3) Pending requests from the old flow become claims only if re-claimed;
--    close them out so they don't linger.
UPDATE redemptions SET status = 'expired' WHERE status = 'requested';

-- 4) Retire request expiry cron (ignore if it was never scheduled)
DO $$ BEGIN
  PERFORM cron.unschedule('expire-requests-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
