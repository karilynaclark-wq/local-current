-- Creator trust metrics (admin-only, not surfaced publicly)
ALTER TABLE creators ADD COLUMN IF NOT EXISTS no_show_count INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS late_post_count INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS missed_post_count INTEGER DEFAULT 0;

-- Creator problem reports (submitted by creator about a business)
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS problem_report_type TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS problem_report_details TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS problem_reported_at TIMESTAMPTZ;

-- Post deadline tracking
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS post_reminder_sent TIMESTAMPTZ;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS post_overdue_notified BOOLEAN DEFAULT FALSE;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
