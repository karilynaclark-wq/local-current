-- ── Report a problem (businesses + general) ─────────────────────────────────
-- Businesses report a problem with an event (optionally about one creator);
-- anyone can report a general problem from Settings. Each report emails the
-- admin inbox via send-email (type 'report'). Creator claim reports keep using
-- redemptions.problem_* (unchanged).

CREATE TABLE IF NOT EXISTS problem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  circuit_id UUID REFERENCES circuits(id) ON DELETE SET NULL,
  creator_id UUID REFERENCES creators(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE problem_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own reports" ON problem_reports;
CREATE POLICY "insert own reports" ON problem_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "read own reports" ON problem_reports;
CREATE POLICY "read own reports" ON problem_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE OR REPLACE FUNCTION trg_email_report() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM email_event('report', NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS email_problem_report ON problem_reports;
CREATE TRIGGER email_problem_report AFTER INSERT ON problem_reports FOR EACH ROW EXECUTE FUNCTION trg_email_report();

NOTIFY pgrst, 'reload schema';
