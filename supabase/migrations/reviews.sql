-- ── Two-way reviews ─────────────────────────────────────────────────────────
-- After a creator posts, the business rates the creator and the creator rates
-- the business: 1–5 stars, an optional note, and "post anonymously" (default on).
-- Reviews show on the reviewed party's profile. Writes go through RPCs that
-- check ownership; reads go through public RPCs that hide anonymous reviewers.

-- Business → creator (existing columns + anonymous flag)
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_review_anonymous BOOLEAN NOT NULL DEFAULT true;

-- Creator → business (new)
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS creator_rating INTEGER CHECK (creator_rating BETWEEN 1 AND 5);
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS creator_review TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS creator_review_anonymous BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS creator_rated_at TIMESTAMPTZ;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS creator_rating_notified TIMESTAMPTZ;

-- Business rates the creator on one of its claims
CREATE OR REPLACE FUNCTION rate_creator(p_redemption_id UUID, p_rating INT, p_note TEXT, p_anonymous BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Pick 1 to 5 stars'; END IF;
  UPDATE redemptions r SET
    business_rating = p_rating,
    business_public_review = nullif(trim(p_note), ''),
    business_review_anonymous = coalesce(p_anonymous, true),
    business_rated_at = now()
  FROM circuits ci JOIN businesses b ON b.id = ci.business_id
  WHERE r.id = p_redemption_id AND ci.id = r.circuit_id AND b.profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM posts p WHERE p.redemption_id = r.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'You can rate a creator after they post'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION rate_creator(UUID, INT, TEXT, BOOLEAN) TO authenticated;

-- Creator rates the business on their own claim
CREATE OR REPLACE FUNCTION rate_business(p_redemption_id UUID, p_rating INT, p_note TEXT, p_anonymous BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Pick 1 to 5 stars'; END IF;
  UPDATE redemptions r SET
    creator_rating = p_rating,
    creator_review = nullif(trim(p_note), ''),
    creator_review_anonymous = coalesce(p_anonymous, true),
    creator_rated_at = now()
  FROM creators c
  WHERE r.id = p_redemption_id AND c.id = r.creator_id AND c.profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM posts p WHERE p.redemption_id = r.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'You can rate the business after you post'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION rate_business(UUID, INT, TEXT, BOOLEAN) TO authenticated;

-- Public: reviews of a creator (from businesses)
CREATE OR REPLACE FUNCTION creator_reviews(p_creator_id UUID)
RETURNS TABLE (rating INT, note TEXT, reviewer TEXT, event_title TEXT, rated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.business_rating, r.business_public_review,
         CASE WHEN r.business_review_anonymous THEN NULL ELSE b.business_name END,
         CASE WHEN r.business_review_anonymous THEN NULL ELSE ci.title END,
         r.business_rated_at
    FROM redemptions r JOIN circuits ci ON ci.id = r.circuit_id JOIN businesses b ON b.id = ci.business_id
   WHERE r.creator_id = p_creator_id AND r.business_rating IS NOT NULL
   ORDER BY r.business_rated_at DESC;
$$;
GRANT EXECUTE ON FUNCTION creator_reviews(UUID) TO authenticated;

-- Public: reviews of a business (from creators)
CREATE OR REPLACE FUNCTION business_reviews(p_business_id UUID)
RETURNS TABLE (rating INT, note TEXT, reviewer TEXT, event_title TEXT, rated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.creator_rating, r.creator_review,
         CASE WHEN r.creator_review_anonymous THEN NULL ELSE _creator_name(r.creator_id) END,
         CASE WHEN r.creator_review_anonymous THEN NULL ELSE ci.title END,
         r.creator_rated_at
    FROM redemptions r JOIN circuits ci ON ci.id = r.circuit_id
   WHERE ci.business_id = p_business_id AND r.creator_rating IS NOT NULL
   ORDER BY r.creator_rated_at DESC;
$$;
GRANT EXECUTE ON FUNCTION business_reviews(UUID) TO authenticated;

-- Activity log: creator reviews (business reviews are already logged)
CREATE OR REPLACE FUNCTION log_business_rated() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.creator_rating IS NOT NULL AND OLD.creator_rating IS NULL THEN
    INSERT INTO activity_log (action, actor_role, actor_name, circuit_id, circuit_title, meta)
    SELECT 'business_rated', 'creator', _creator_name(NEW.creator_id), ci.id, ci.title,
           jsonb_build_object('business', _business_name(ci.business_id), 'rating', NEW.creator_rating)
      FROM circuits ci WHERE ci.id = NEW.circuit_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_business_rated ON redemptions;
CREATE TRIGGER trg_log_business_rated AFTER UPDATE ON redemptions FOR EACH ROW EXECUTE FUNCTION log_business_rated();

-- Carry over reviews creators left on the old post-submitted screen
DO $$ BEGIN
  IF to_regclass('public.redemption_feedback') IS NOT NULL THEN
    UPDATE redemptions r SET
      creator_rating = f.rating,
      creator_review = f.public_feedback,
      creator_review_anonymous = (f.public_feedback IS NULL),
      creator_rated_at = f.created_at
    FROM (SELECT DISTINCT ON (redemption_id) * FROM redemption_feedback
           WHERE rating BETWEEN 1 AND 5 ORDER BY redemption_id, created_at DESC) f
    WHERE f.redemption_id = r.id AND r.creator_rating IS NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
