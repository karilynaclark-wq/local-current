-- ── Extra profile fields + stat snapshots for social connections ─────────────

-- New profile fields we can now pull from TikTok (scopes already granted).
ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS profile_deep_link TEXT;

-- Dated snapshots so we can show follower growth over time. One row per sync.
CREATE TABLE IF NOT EXISTS social_stat_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  follower_count  INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  likes_count     INTEGER DEFAULT 0,
  media_count     INTEGER DEFAULT 0,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_stat_snapshots_lookup_idx
  ON social_stat_snapshots (profile_id, platform, captured_at DESC);

ALTER TABLE social_stat_snapshots ENABLE ROW LEVEL SECURITY;

-- Owner may read their own snapshots; rows are written by the edge function
-- via the service role (which bypasses RLS), so no insert policy is needed.
CREATE POLICY "social_stat_snapshots_select_own" ON social_stat_snapshots
  FOR SELECT USING (auth.uid() = profile_id);

NOTIFY pgrst, 'reload schema';
