-- Flag set when a connection's token can no longer be refreshed and the user
-- must re-link the account. Cleared on a successful connect/sync.
ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS needs_reconnect BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
