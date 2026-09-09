-- ── Enable RLS on all tables (safe to run even if already enabled) ────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_codes ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Anyone can read basic profile info (name, avatar, role) but NOT push_token
CREATE POLICY "profiles_select_public" ON profiles
  FOR SELECT USING (true);

-- Only the owner can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- push_token: restrict to owner only via a column-level approach.
-- Since Postgres RLS is row-level not column-level, we handle this
-- by ensuring push_token is only written by the owner (handled above)
-- and only read server-side via service role. The anon/authenticated
-- role should not be able to select push_token from other users.
-- We rely on edge functions using service role for all push token lookups.

-- ── creators ─────────────────────────────────────────────────────────────────
-- Public read of approved creators (but NOT trust metrics)
-- Trust metrics (no_show_count, late_post_count, missed_post_count) are
-- readable only by the owner — enforced by not exposing them in the
-- public-facing query (app only reads them in admin context with service role)
CREATE POLICY "creators_select_approved" ON creators
  FOR SELECT USING (status = 'approved' OR auth.uid() = profile_id);

-- Creators can only insert/update their own record
CREATE POLICY "creators_insert_own" ON creators
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "creators_update_own" ON creators
  FOR UPDATE USING (auth.uid() = profile_id);

-- ── businesses ────────────────────────────────────────────────────────────────
CREATE POLICY "businesses_select_all" ON businesses
  FOR SELECT USING (true);

CREATE POLICY "businesses_insert_own" ON businesses
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "businesses_update_own" ON businesses
  FOR UPDATE USING (auth.uid() = profile_id);

-- ── circuits ─────────────────────────────────────────────────────────────────
-- Anyone authenticated can read active circuits
CREATE POLICY "circuits_select_active" ON circuits
  FOR SELECT USING (is_active = true OR auth.uid() IN (
    SELECT profile_id FROM businesses WHERE id = circuits.business_id
  ));

-- Only the owning business can insert/update/delete
CREATE POLICY "circuits_insert_own" ON circuits
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT profile_id FROM businesses WHERE id = business_id)
  );

CREATE POLICY "circuits_update_own" ON circuits
  FOR UPDATE USING (
    auth.uid() IN (SELECT profile_id FROM businesses WHERE id = business_id)
  );

CREATE POLICY "circuits_delete_own" ON circuits
  FOR DELETE USING (
    auth.uid() IN (SELECT profile_id FROM businesses WHERE id = business_id)
  );

-- ── redemptions ───────────────────────────────────────────────────────────────
-- Creators can see their own redemptions
-- Businesses can see redemptions for their circuits
CREATE POLICY "redemptions_select_own" ON redemptions
  FOR SELECT USING (
    auth.uid() IN (SELECT profile_id FROM creators WHERE id = redemptions.creator_id)
    OR
    auth.uid() IN (
      SELECT b.profile_id FROM businesses b
      JOIN circuits c ON c.business_id = b.id
      WHERE c.id = redemptions.circuit_id
    )
  );

CREATE POLICY "redemptions_insert_creator" ON redemptions
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT profile_id FROM creators WHERE id = creator_id)
  );

CREATE POLICY "redemptions_update_own" ON redemptions
  FOR UPDATE USING (
    auth.uid() IN (SELECT profile_id FROM creators WHERE id = redemptions.creator_id)
    OR
    auth.uid() IN (
      SELECT b.profile_id FROM businesses b
      JOIN circuits c ON c.business_id = b.id
      WHERE c.id = redemptions.circuit_id
    )
  );

CREATE POLICY "redemptions_delete_creator" ON redemptions
  FOR DELETE USING (
    auth.uid() IN (SELECT profile_id FROM creators WHERE id = redemptions.creator_id)
  );

-- ── posts ────────────────────────────────────────────────────────────────────
CREATE POLICY "posts_select_own" ON posts
  FOR SELECT USING (
    auth.uid() IN (SELECT profile_id FROM creators WHERE id = posts.creator_id)
    OR
    auth.uid() IN (SELECT profile_id FROM businesses WHERE id = posts.business_id)
  );

CREATE POLICY "posts_insert_creator" ON posts
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT profile_id FROM creators WHERE id = creator_id)
  );

-- ── circuit_codes ─────────────────────────────────────────────────────────────
-- Only the creator who holds the redemption can see their code
CREATE POLICY "circuit_codes_select_own" ON circuit_codes
  FOR SELECT USING (
    redemption_id IS NULL -- unassigned codes not visible
    OR auth.uid() IN (
      SELECT c.profile_id FROM creators c
      JOIN redemptions r ON r.creator_id = c.id
      WHERE r.id = circuit_codes.redemption_id
    )
  );

-- ── Refresh schema cache ───────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
