-- Exact TikTok / Instagram follower counts for creators (from connected accounts).
-- Follower counts are public on the platforms, so any signed-in user may read them.
CREATE OR REPLACE FUNCTION creator_follower_counts(p_creator_ids UUID[])
RETURNS TABLE (creator_id UUID, tiktok INT, instagram INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id,
         max(s.follower_count) FILTER (WHERE s.platform = 'tiktok')::INT,
         max(s.follower_count) FILTER (WHERE s.platform = 'instagram')::INT
    FROM creators c
    LEFT JOIN social_connections s ON s.profile_id = c.profile_id AND s.connection_type = 'oauth'
   WHERE c.id = ANY (p_creator_ids)
   GROUP BY c.id;
$$;
GRANT EXECUTE ON FUNCTION creator_follower_counts(UUID[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
