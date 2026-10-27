-- ── Auto-import tagged posts ─────────────────────────────────────────────────
-- When a creator's TikTok/Instagram syncs, posts captioned with #localcurrent
-- or @localcurrentapp are attached to the matching claim automatically
-- (supabase/functions/_shared/postImport.ts). Every sync also refreshes the
-- stats of already-recorded posts and keeps a dated snapshot, which the
-- 24-hour / 3-day results emails read from.

-- 1) Richer post records
ALTER TABLE posts ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shares INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS saves INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reach INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS stats_updated_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'auto'));

-- One record per platform video
CREATE UNIQUE INDEX IF NOT EXISTS posts_platform_external_id
  ON posts (platform, external_post_id) WHERE external_post_id IS NOT NULL;

-- 2) Stats history per post (for "24 hours later" / "3 days later" results)
CREATE TABLE IF NOT EXISTS post_stat_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  views       INTEGER,
  likes       INTEGER,
  comments    INTEGER,
  shares      INTEGER,
  saves       INTEGER,
  reach       INTEGER,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_stat_snapshots_post ON post_stat_snapshots (post_id, captured_at);

ALTER TABLE post_stat_snapshots ENABLE ROW LEVEL SECURITY;
-- Businesses can read snapshots for posts about their events; creators their own.
DROP POLICY IF EXISTS "post_snapshots_read" ON post_stat_snapshots;
CREATE POLICY "post_snapshots_read" ON post_stat_snapshots FOR SELECT USING (
  post_id IN (
    SELECT p.id FROM posts p
     WHERE p.business_id IN (SELECT id FROM businesses WHERE profile_id = auth.uid())
        OR p.creator_id IN (SELECT id FROM creators WHERE profile_id = auth.uid())
  )
);

-- 3) Creators can read their own posts (needed to show auto-imported ones)
DROP POLICY IF EXISTS "Creators can read own posts" ON posts;
CREATE POLICY "Creators can read own posts" ON posts FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE profile_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
