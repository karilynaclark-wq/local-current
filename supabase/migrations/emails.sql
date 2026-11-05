-- ── Emails ──────────────────────────────────────────────────────────────────
-- Database events call the send-email edge function (via pg_net), and an hourly
-- job sends the 24-hours-after-a-post emails. Copy: docs/local-current-emails.html.
--
-- BEFORE RUNNING: replace CRON_SECRET_VALUE below (one place) with the CRON_SECRET
-- from Supabase → Edge Functions → Secrets.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Private settings (not readable from the app)
CREATE TABLE IF NOT EXISTS private_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
ALTER TABLE private_settings ENABLE ROW LEVEL SECURITY;  -- no policies
INSERT INTO private_settings (key, value) VALUES ('cron_secret', 'CRON_SECRET_VALUE')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2) What's been sent (so each email goes out once) + unsubscribe flag
CREATE TABLE IF NOT EXISTS email_log (key TEXT PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;  -- no policies
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;

-- Don't email people about things that happened before emails existed
INSERT INTO email_log (key) SELECT '01:' || id FROM creators ON CONFLICT DO NOTHING;
INSERT INTO email_log (key) SELECT '14c:' || id FROM creators ON CONFLICT DO NOTHING;
INSERT INTO email_log (key) SELECT '06:' || id FROM businesses ON CONFLICT DO NOTHING;
INSERT INTO email_log (key) SELECT '14b:' || id FROM businesses ON CONFLICT DO NOTHING;
INSERT INTO email_log (key) SELECT '07:' || id FROM circuits ON CONFLICT DO NOTHING;
INSERT INTO email_log (key) SELECT k || id FROM redemptions, unnest(ARRAY['04:', '09:', '10:', '04b:', '10b:']) k ON CONFLICT DO NOTHING;
INSERT INTO email_log (key) SELECT '11:' || id FROM posts ON CONFLICT DO NOTHING;

-- 3) Call send-email
CREATE OR REPLACE FUNCTION email_event(p_type TEXT, p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://pxncnpuzgdmlsaxgrxkq.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM private_settings WHERE key = 'cron_secret')),
    body := jsonb_build_object('type', p_type, 'id', p_id)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_event % failed: %', p_type, SQLERRM;  -- never block the app
END $$;
REVOKE EXECUTE ON FUNCTION email_event(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- 4) Triggers
CREATE OR REPLACE FUNCTION trg_email_creator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM email_event('creator_signup', NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS email_creator_signup ON creators;
CREATE TRIGGER email_creator_signup AFTER INSERT ON creators FOR EACH ROW EXECUTE FUNCTION trg_email_creator();

CREATE OR REPLACE FUNCTION trg_email_business() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM email_event('business_signup', NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS email_business_signup ON businesses;
CREATE TRIGGER email_business_signup AFTER INSERT ON businesses FOR EACH ROW EXECUTE FUNCTION trg_email_business();

CREATE OR REPLACE FUNCTION trg_email_circuit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM email_event('current_posted', NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS email_current_posted ON circuits;
CREATE TRIGGER email_current_posted AFTER INSERT ON circuits FOR EACH ROW EXECUTE FUNCTION trg_email_circuit();

CREATE OR REPLACE FUNCTION trg_email_redemption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('approved', 'claimed')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM email_event('claim', NEW.id);
  END IF;
  IF NEW.problem_reported_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.problem_reported_at IS DISTINCT FROM NEW.problem_reported_at) THEN
    PERFORM email_event('problem', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_redemption ON redemptions;
CREATE TRIGGER email_redemption AFTER INSERT OR UPDATE ON redemptions FOR EACH ROW EXECUTE FUNCTION trg_email_redemption();

CREATE OR REPLACE FUNCTION trg_email_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM email_event('post', NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS email_post_added ON posts;
CREATE TRIGGER email_post_added AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION trg_email_post();

-- 5) Hourly: review prompts + 24-hour results
DO $$ BEGIN PERFORM cron.unschedule('send-email-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('send-email-hourly', '15 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://pxncnpuzgdmlsaxgrxkq.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM private_settings WHERE key = 'cron_secret')),
    body := '{"type":"hourly"}'::jsonb
  );
$cron$);

NOTIFY pgrst, 'reload schema';
