-- ── Security phase 2: RUN ONLY AFTER the App Store update is live ────────────
-- (and most users have updated). Older app versions read these columns and
-- submit posts by link, so running this early breaks them.
--
-- 3. Hide every user's email + push token from other users.
-- 5. Posts only come from connected-account auto-import (no pasted links).

-- Column-level read access on profiles: everything except email + push_token.
REVOKE SELECT ON profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, role, created_at, avatar_url, email_opt_out) ON profiles TO authenticated;

-- Creators can no longer add posts themselves.
DROP POLICY IF EXISTS "Creators can insert own posts" ON posts;
DROP POLICY IF EXISTS "posts_insert_creator" ON posts;

NOTIFY pgrst, 'reload schema';
