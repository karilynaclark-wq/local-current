-- AI-written summary of a creator's recent content (summarize-creator function).
ALTER TABLE creators ADD COLUMN IF NOT EXISTS ai_summary JSONB;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS ai_summary_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
