-- Instagram follower location (top cities/countries, Chicago + Illinois share),
-- written by _shared/igAudience.ts on connect and daily sync.
ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS audience JSONB;
NOTIFY pgrst, 'reload schema';
