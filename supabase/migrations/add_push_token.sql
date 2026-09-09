-- Add push token column to profiles for Expo push notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Index for fast lookup when sending to a single user
CREATE INDEX IF NOT EXISTS profiles_push_token_idx ON profiles (push_token) WHERE push_token IS NOT NULL;
