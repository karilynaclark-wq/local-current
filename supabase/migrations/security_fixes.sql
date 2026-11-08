-- ── Security fixes (2026-11-07) ──────────────────────────────────────────────
-- 1. Admin access: drop old policies keyed to unregistered emails
--    (hello@join-circuit.com, admin@circuitapp.com) and use is_admin() instead.
-- 2. Creators: follower counts only come from a connected TikTok/Instagram
--    account; creators can't change their own status, counts or handles.
-- 4. Ratings: nobody can edit a rating directly (only via rate_* functions).
-- 3. Push: can_notify() decides who may push whom (used by send-push).
-- Safe to run more than once.

-- ── 1. Admin policies ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin can read all businesses"   ON businesses;
DROP POLICY IF EXISTS "Admin can read all circuits"     ON circuits;
DROP POLICY IF EXISTS "Admin can read all creators"     ON creators;
DROP POLICY IF EXISTS "Admin can update all creators"   ON creators;
DROP POLICY IF EXISTS "Admin can read all posts"        ON posts;
DROP POLICY IF EXISTS "Admin can update all posts"      ON posts;
DROP POLICY IF EXISTS "Admin can read all profiles"     ON profiles;
DROP POLICY IF EXISTS "Admin can read all redemptions"  ON redemptions;

CREATE POLICY "Admin can read all businesses"  ON businesses  FOR SELECT USING (is_admin());
CREATE POLICY "Admin can read all circuits"    ON circuits    FOR SELECT USING (is_admin());
CREATE POLICY "Admin can read all creators"    ON creators    FOR SELECT USING (is_admin());
CREATE POLICY "Admin can update all creators"  ON creators    FOR UPDATE USING (is_admin());
CREATE POLICY "Admin can read all posts"       ON posts       FOR SELECT USING (is_admin());
CREATE POLICY "Admin can update all posts"     ON posts       FOR UPDATE USING (is_admin());
CREATE POLICY "Admin can read all profiles"    ON profiles    FOR SELECT USING (is_admin() OR auth.uid() = id);
CREATE POLICY "Admin can read all redemptions" ON redemptions FOR SELECT USING (is_admin());

-- ── 2. Follower counts come from connected accounts only ─────────────────────
CREATE OR REPLACE FUNCTION creator_best_count(p_creator_id UUID, p_platform TEXT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(s.follower_count)::INT
    FROM creators c JOIN social_connections s ON s.profile_id = c.profile_id
   WHERE c.id = p_creator_id AND s.connection_type = 'oauth'
     AND s.platform = ANY (CASE WHEN p_platform IN ('tiktok', 'instagram') THEN ARRAY[p_platform]
                                ELSE ARRAY['tiktok', 'instagram'] END);
$$;

CREATE OR REPLACE FUNCTION guard_creator_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Server code (edge functions, SQL editor) and admins are not limited.
  IF current_user NOT IN ('authenticated', 'anon') OR is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM social_connections
                    WHERE profile_id = NEW.profile_id AND connection_type = 'oauth') THEN
      RAISE EXCEPTION 'Connect your TikTok or Instagram to continue';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.follower_range IS DISTINCT FROM OLD.follower_range
     OR NEW.secondary_follower_range IS DISTINCT FROM OLD.secondary_follower_range
     OR NEW.main_platform IS DISTINCT FROM OLD.main_platform
     OR NEW.secondary_platform IS DISTINCT FROM OLD.secondary_platform
     OR NEW.tiktok_handle IS DISTINCT FROM OLD.tiktok_handle
     OR NEW.instagram_handle IS DISTINCT FROM OLD.instagram_handle
     OR NEW.tiktok_verified IS DISTINCT FROM OLD.tiktok_verified
     OR NEW.instagram_verified IS DISTINCT FROM OLD.instagram_verified
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'These details come from your connected accounts';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_creator_fields ON creators;
CREATE TRIGGER guard_creator_fields BEFORE INSERT OR UPDATE ON creators
  FOR EACH ROW EXECUTE FUNCTION guard_creator_fields();

-- ── 4. Ratings only through rate_creator / rate_business ─────────────────────
CREATE OR REPLACE FUNCTION guard_redemption_ratings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.business_rating IS DISTINCT FROM OLD.business_rating
     OR NEW.business_public_review IS DISTINCT FROM OLD.business_public_review
     OR NEW.business_review_anonymous IS DISTINCT FROM OLD.business_review_anonymous
     OR NEW.business_rated_at IS DISTINCT FROM OLD.business_rated_at
     OR NEW.creator_rating IS DISTINCT FROM OLD.creator_rating
     OR NEW.creator_review IS DISTINCT FROM OLD.creator_review
     OR NEW.creator_review_anonymous IS DISTINCT FROM OLD.creator_review_anonymous
     OR NEW.creator_rated_at IS DISTINCT FROM OLD.creator_rated_at
     OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
     OR NEW.circuit_id IS DISTINCT FROM OLD.circuit_id THEN
    RAISE EXCEPTION 'Use the rating screen to leave a review';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_redemption_ratings ON redemptions;
CREATE TRIGGER guard_redemption_ratings BEFORE UPDATE ON redemptions
  FOR EACH ROW EXECUTE FUNCTION guard_redemption_ratings();

-- ── 3. Who may send a push to whom ───────────────────────────────────────────
-- Allowed: admins → anyone; anyone → an admin; a creator ↔ the business whose
-- event they claimed.
CREATE OR REPLACE FUNCTION can_notify(p_from UUID, p_to UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM admins a JOIN auth.users u ON lower(u.email) = lower(a.email) WHERE u.id = p_from)
 OR EXISTS (SELECT 1 FROM admins a JOIN auth.users u ON lower(u.email) = lower(a.email) WHERE u.id = p_to)
 OR EXISTS (
      SELECT 1 FROM redemptions r
        JOIN creators c ON c.id = r.creator_id
        JOIN circuits ci ON ci.id = r.circuit_id
        JOIN businesses b ON b.id = ci.business_id
       WHERE (c.profile_id = p_from AND b.profile_id = p_to)
          OR (b.profile_id = p_from AND c.profile_id = p_to));
$$;
REVOKE EXECUTE ON FUNCTION can_notify(UUID, UUID) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
