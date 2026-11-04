-- Public follower counts for a creator's verified (OAuth) accounts. The
-- social_connections table itself stays private (it holds tokens); this
-- exposes only platform + follower count for profile pills.
CREATE OR REPLACE FUNCTION creator_follower_counts(p_creator_id UUID)
RETURNS TABLE (platform TEXT, follower_count INT, username TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sc.platform, sc.follower_count, sc.username
    FROM social_connections sc
    JOIN creators c ON c.profile_id = sc.profile_id
   WHERE c.id = p_creator_id AND sc.connection_type = 'oauth';
$$;
GRANT EXECUTE ON FUNCTION creator_follower_counts(UUID) TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
