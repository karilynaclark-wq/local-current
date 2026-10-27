-- Daily Instagram sync: refresh tokens, stats, and auto-import #localcurrent posts.
-- Replace CRON_SECRET_VALUE with the cron secret before running.
DO $$ BEGIN PERFORM cron.unschedule('instagram-sync-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'instagram-sync-daily',
  '20 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pxncnpuzgdmlsaxgrxkq.supabase.co/functions/v1/instagram-sync-all',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CRON_SECRET_VALUE'),
    body := '{}'::jsonb
  );
  $cron$
);
