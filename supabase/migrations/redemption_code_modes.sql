-- ── Redemption code modes ────────────────────────────────────────────────────
-- How a current's codes map to creators:
--   shared      – one code used by every creator (never assigned to anyone)
--   per_creator – one code handed to each creator (covers them + any friends)
--   per_person  – (1 + guest_count) codes handed to each creator
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS code_mode TEXT
  CHECK (code_mode IN ('shared', 'per_creator', 'per_person'));

-- Backfill existing currents to match how the app treated them before:
-- a single code was shared by everyone; multiple codes were one per creator.
UPDATE circuits c
SET code_mode = CASE
  WHEN c.redemption_type = 'code'
       AND (SELECT count(*) FROM circuit_codes cc WHERE cc.circuit_id = c.id) = 1
    THEN 'shared'
  ELSE 'per_creator'
END
WHERE c.code_mode IS NULL
  AND EXISTS (SELECT 1 FROM circuit_codes cc WHERE cc.circuit_id = c.id);

-- ── Hand out codes when a creator claims ─────────────────────────────────────
-- Replaces the body of the existing trigger function (same name, so the
-- existing AFTER INSERT trigger on redemptions keeps calling it).
CREATE OR REPLACE FUNCTION assign_circuit_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode   TEXT;
  v_guests INT;
  v_count  INT;
BEGIN
  SELECT code_mode, COALESCE(guest_count, 0)
    INTO v_mode, v_guests
    FROM circuits WHERE id = NEW.circuit_id;

  -- Shared codes are never assigned; every claimer can read the one code.
  IF v_mode = 'shared' THEN
    RETURN NEW;
  END IF;

  v_count := CASE WHEN v_mode = 'per_person' THEN 1 + v_guests ELSE 1 END;

  UPDATE circuit_codes
     SET redemption_id = NEW.id
   WHERE id IN (
     SELECT id FROM circuit_codes
      WHERE circuit_id = NEW.circuit_id
        AND redemption_id IS NULL
        AND NOT COALESCE(is_used, false)
      ORDER BY created_at
      LIMIT v_count
      FOR UPDATE SKIP LOCKED
   );

  RETURN NEW;
END;
$$;

-- ── Who can read codes ───────────────────────────────────────────────────────
-- Previously any signed-in user could read every unassigned code. Now:
--   • a creator sees codes assigned to their own redemption, and
--   • the shared code of a current they have claimed.
-- (The business-owner policy on circuit_codes is unchanged.)
DROP POLICY IF EXISTS "circuit_codes_select_own" ON circuit_codes;
CREATE POLICY "circuit_codes_select_own" ON circuit_codes
  FOR SELECT USING (
    auth.uid() IN (
      SELECT c.profile_id FROM creators c
      JOIN redemptions r ON r.creator_id = c.id
      WHERE r.id = circuit_codes.redemption_id
    )
    OR (
      circuit_codes.redemption_id IS NULL
      AND EXISTS (
        SELECT 1 FROM circuits ci
        WHERE ci.id = circuit_codes.circuit_id AND ci.code_mode = 'shared'
      )
      AND EXISTS (
        SELECT 1 FROM redemptions r
        JOIN creators c ON c.id = r.creator_id
        WHERE r.circuit_id = circuit_codes.circuit_id AND c.profile_id = auth.uid()
      )
    )
  );

NOTIFY pgrst, 'reload schema';
