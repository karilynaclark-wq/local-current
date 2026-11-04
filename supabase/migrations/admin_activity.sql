-- ── Admin: activity log + overview for the web admin page ────────────────────
-- Every key action is written to activity_log by database triggers, so the feed
-- is complete regardless of app version. Only admins (admins table) can read it,
-- enforced in the database: the website uses the public key and signs in as you.

-- 1) Who is an admin (by login email)
CREATE TABLE IF NOT EXISTS admins (email TEXT PRIMARY KEY);
INSERT INTO admins (email) VALUES ('hello@localcurrentapp.com') ON CONFLICT DO NOTHING;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;  -- no policies: not readable from the app

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE lower(email) = lower(auth.jwt() ->> 'email'));
$$;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- 2) Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  action      TEXT NOT NULL,        -- e.g. creator_signed_up, current_posted, tickets_claimed
  actor_role  TEXT,                 -- creator | business
  actor_name  TEXT,
  circuit_id  UUID,
  circuit_title TEXT,
  meta        JSONB
);
CREATE INDEX IF NOT EXISTS activity_log_created ON activity_log (created_at DESC);
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read activity" ON activity_log;
CREATE POLICY "admins read activity" ON activity_log FOR SELECT USING (is_admin());

-- Helpers for names
CREATE OR REPLACE FUNCTION _creator_name(p_creator UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(p.full_name, ''), '@' || coalesce(c.tiktok_handle, c.instagram_handle), 'Creator')
    FROM creators c LEFT JOIN profiles p ON p.id = c.profile_id WHERE c.id = p_creator;
$$;
CREATE OR REPLACE FUNCTION _business_name(p_business UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_name FROM businesses WHERE id = p_business;
$$;

-- 3) Triggers
CREATE OR REPLACE FUNCTION log_creator_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO activity_log (action, actor_role, actor_name, meta)
  VALUES ('creator_signed_up', 'creator', _creator_name(NEW.id),
          jsonb_build_object('tiktok', NEW.tiktok_handle, 'instagram', NEW.instagram_handle,
                             'followers', NEW.follower_range, 'zip', NEW.zip_code));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_creator_signup ON creators;
CREATE TRIGGER trg_log_creator_signup AFTER INSERT ON creators FOR EACH ROW EXECUTE FUNCTION log_creator_signup();

CREATE OR REPLACE FUNCTION log_business_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO activity_log (action, actor_role, actor_name, meta)
  VALUES ('business_signed_up', 'business', NEW.business_name, jsonb_build_object('address', NEW.address));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_business_signup ON businesses;
CREATE TRIGGER trg_log_business_signup AFTER INSERT ON businesses FOR EACH ROW EXECUTE FUNCTION log_business_signup();

CREATE OR REPLACE FUNCTION log_circuit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity_log (action, actor_role, actor_name, circuit_id, circuit_title, meta)
    VALUES ('current_posted', 'business', _business_name(NEW.business_id), NEW.id, NEW.title,
            jsonb_build_object('creators', NEW.max_redemptions, 'min_followers', NEW.min_followers));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO activity_log (action, actor_role, actor_name, circuit_id, circuit_title)
    VALUES ('current_deleted', 'business', _business_name(OLD.business_id), OLD.id, OLD.title);
    RETURN OLD;
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    INSERT INTO activity_log (action, actor_role, actor_name, circuit_id, circuit_title)
    VALUES (CASE WHEN NEW.is_active THEN 'current_resumed' ELSE 'current_closed' END,
            'business', _business_name(NEW.business_id), NEW.id, NEW.title);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_circuit_change ON circuits;
CREATE TRIGGER trg_log_circuit_change AFTER INSERT OR UPDATE OR DELETE ON circuits FOR EACH ROW EXECUTE FUNCTION log_circuit_change();

CREATE OR REPLACE FUNCTION log_redemption_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title TEXT; v_action TEXT;
BEGIN
  SELECT title INTO v_title FROM circuits WHERE id = NEW.circuit_id;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'approved' THEN 'tickets_claimed'
      WHEN 'claimed' THEN 'tickets_claimed'
      WHEN 'checked_in' THEN 'tickets_booked'
      WHEN 'completed' THEN 'claim_completed'
      WHEN 'cancelled' THEN 'claim_withdrawn'
      ELSE NULL END;
    IF v_action IS NOT NULL THEN
      INSERT INTO activity_log (action, actor_role, actor_name, circuit_id, circuit_title)
      VALUES (v_action, 'creator', _creator_name(NEW.creator_id), NEW.circuit_id, v_title);
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.business_rating IS NOT NULL AND OLD.business_rating IS NULL THEN
    INSERT INTO activity_log (action, actor_role, actor_name, circuit_id, circuit_title, meta)
    VALUES ('creator_rated', 'business', (SELECT _business_name(business_id) FROM circuits WHERE id = NEW.circuit_id),
            NEW.circuit_id, v_title,
            jsonb_build_object('creator', _creator_name(NEW.creator_id), 'rating', NEW.business_rating));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_redemption_change ON redemptions;
CREATE TRIGGER trg_log_redemption_change AFTER INSERT OR UPDATE ON redemptions FOR EACH ROW EXECUTE FUNCTION log_redemption_change();

CREATE OR REPLACE FUNCTION log_post_added() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO activity_log (action, actor_role, actor_name, circuit_id, circuit_title, meta)
  SELECT 'post_added', 'creator', _creator_name(NEW.creator_id), r.circuit_id, ci.title,
         jsonb_build_object('platform', NEW.platform, 'url', NEW.video_url, 'source', NEW.source)
    FROM redemptions r JOIN circuits ci ON ci.id = r.circuit_id WHERE r.id = NEW.redemption_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_post_added ON posts;
CREATE TRIGGER trg_log_post_added AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION log_post_added();

-- 4) Backfill sign-ups and currents that already exist (once)
INSERT INTO activity_log (created_at, action, actor_role, actor_name, meta)
SELECT p.created_at, 'creator_signed_up', 'creator', _creator_name(c.id),
       jsonb_build_object('tiktok', c.tiktok_handle, 'instagram', c.instagram_handle, 'followers', c.follower_range, 'backfilled', true)
  FROM creators c JOIN profiles p ON p.id = c.profile_id
 WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action = 'creator_signed_up');
INSERT INTO activity_log (created_at, action, actor_role, actor_name, meta)
SELECT b.created_at, 'business_signed_up', 'business', b.business_name, jsonb_build_object('backfilled', true)
  FROM businesses b
 WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action = 'business_signed_up');
INSERT INTO activity_log (created_at, action, actor_role, actor_name, circuit_id, circuit_title, meta)
SELECT ci.created_at, 'current_posted', 'business', _business_name(ci.business_id), ci.id, ci.title, jsonb_build_object('backfilled', true)
  FROM circuits ci
 WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action = 'current_posted');

-- 5) Overview numbers for the dashboard (admins only)
CREATE OR REPLACE FUNCTION admin_overview() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE wk TIMESTAMPTZ := now() - interval '7 days'; pwk TIMESTAMPTZ := now() - interval '14 days';
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN jsonb_build_object(
    'creators',            (SELECT count(*) FROM creators),
    'creators_this_week',  (SELECT count(*) FROM creators c JOIN profiles p ON p.id = c.profile_id WHERE p.created_at >= wk),
    'creators_last_week',  (SELECT count(*) FROM creators c JOIN profiles p ON p.id = c.profile_id WHERE p.created_at >= pwk AND p.created_at < wk),
    'businesses',          (SELECT count(*) FROM businesses),
    'businesses_this_week',(SELECT count(*) FROM businesses WHERE created_at >= wk),
    'businesses_last_week',(SELECT count(*) FROM businesses WHERE created_at >= pwk AND created_at < wk),
    'live_currents',       (SELECT count(*) FROM circuits WHERE is_active),
    'currents_this_week',  (SELECT count(*) FROM circuits WHERE created_at >= wk),
    'claims_this_week',    (SELECT count(*) FROM activity_log WHERE action = 'tickets_claimed' AND created_at >= wk),
    'posts_total',         (SELECT count(*) FROM posts),
    'posts_this_week',     (SELECT count(*) FROM posts WHERE submitted_at >= wk),
    'views_total',         (SELECT coalesce(sum(views), 0) FROM posts)
  );
END $$;
GRANT EXECUTE ON FUNCTION admin_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
