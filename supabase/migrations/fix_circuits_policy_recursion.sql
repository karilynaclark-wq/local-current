-- Fix: the "Creators can read circuits they claimed" policy queried
-- redemptions, whose business policy queries circuits → infinite recursion
-- (42P17) on every circuits read. Look up the claimed ids in a SECURITY
-- DEFINER function instead, which bypasses RLS and breaks the loop.

CREATE OR REPLACE FUNCTION my_claimed_circuit_ids() RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.circuit_id FROM redemptions r
    JOIN creators c ON c.id = r.creator_id
   WHERE c.profile_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION my_claimed_circuit_ids() TO authenticated, anon;

DROP POLICY IF EXISTS "Creators can read circuits they claimed" ON circuits;
CREATE POLICY "Creators can read circuits they claimed" ON circuits FOR SELECT
  USING (id IN (SELECT my_claimed_circuit_ids()));

NOTIFY pgrst, 'reload schema';
