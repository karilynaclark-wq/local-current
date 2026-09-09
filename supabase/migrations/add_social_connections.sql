-- ── Social account connections (TikTok, Instagram) ──────────────────────────
-- Stores OAuth tokens + synced stats for a creator's connected platforms.
-- Tokens are written and read ONLY by edge functions using the service role.
-- Clients read the non-sensitive columns for their own row (RLS below) and
-- must never select the *_token columns.

CREATE TABLE IF NOT EXISTS social_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram')),

  -- Identity on the platform
  external_user_id TEXT,                 -- TikTok open_id / Instagram user id
  username         TEXT,                 -- @handle
  avatar_url       TEXT,
  profile_url      TEXT,

  -- OAuth (service-role only)
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes           TEXT,

  -- Synced stats
  follower_count   INTEGER DEFAULT 0,
  following_count  INTEGER DEFAULT 0,
  likes_count      INTEGER DEFAULT 0,
  media_count      INTEGER DEFAULT 0,    -- video_count (TikTok) / media_count (IG)
  recent_posts     JSONB,                -- cached list of latest posts

  -- Connection type: 'oauth' for verified API, 'manual' for self-reported fallback
  connection_type  TEXT NOT NULL DEFAULT 'oauth' CHECK (connection_type IN ('oauth', 'manual')),

  last_synced_at   TIMESTAMPTZ,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (profile_id, platform)
);

CREATE INDEX IF NOT EXISTS social_connections_profile_idx
  ON social_connections (profile_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;

-- Owner may read their own connection rows (app selects only safe columns).
CREATE POLICY "social_connections_select_own" ON social_connections
  FOR SELECT USING (auth.uid() = profile_id);

-- Owner may insert/update a MANUAL connection for themselves (fallback path).
-- OAuth rows are written by the edge function via service role, which bypasses RLS.
CREATE POLICY "social_connections_upsert_manual" ON social_connections
  FOR INSERT WITH CHECK (auth.uid() = profile_id AND connection_type = 'manual');

CREATE POLICY "social_connections_update_manual" ON social_connections
  FOR UPDATE USING (auth.uid() = profile_id AND connection_type = 'manual');

-- Owner may disconnect (delete) any of their own connections.
CREATE POLICY "social_connections_delete_own" ON social_connections
  FOR DELETE USING (auth.uid() = profile_id);

-- ── OAuth state (CSRF + PKCE) ────────────────────────────────────────────────
-- Short-lived rows created by the edge function's `start` step, consumed at
-- `callback`. Written/read ONLY by the service role; no client access at all.
CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  code_verifier TEXT NOT NULL,           -- PKCE
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies => authenticated/anon clients cannot read or write. Service role
-- (used by the edge function) bypasses RLS.

-- ── Refresh schema cache ─────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
