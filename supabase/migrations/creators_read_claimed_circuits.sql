-- Past currents are inactive, and circuits RLS only exposed active ones, so a
-- creator's own completed/claimed currents came back as null in joins (the
-- profile showed "Circuit" instead of the event name). Let creators read any
-- current they have a claim on, and businesses read their own.

DROP POLICY IF EXISTS "Creators can read circuits they claimed" ON circuits;
CREATE POLICY "Creators can read circuits they claimed" ON circuits FOR SELECT USING (
  id IN (
    SELECT r.circuit_id FROM redemptions r
      JOIN creators c ON c.id = r.creator_id
     WHERE c.profile_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
