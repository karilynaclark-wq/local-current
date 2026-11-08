-- Undo security_phase2_after_update.sql until the App Store update is live.
GRANT SELECT ON profiles TO authenticated;
DROP POLICY IF EXISTS "Creators can insert own posts" ON posts;
CREATE POLICY "Creators can insert own posts" ON posts FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creators WHERE profile_id = auth.uid()));
NOTIFY pgrst, 'reload schema';
