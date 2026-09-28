-- Public "Verified" flags per platform. Set by edge functions when a creator's
-- account is connected via OAuth; cleared on disconnect. Readable wherever the
-- creators row is readable (e.g. public profiles), unlike social_connections.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS tiktok_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS instagram_verified BOOLEAN NOT NULL DEFAULT false;

-- Backfill from existing OAuth connections.
UPDATE creators c SET tiktok_verified = true
  FROM social_connections s
  WHERE s.profile_id = c.profile_id AND s.platform = 'tiktok' AND s.connection_type = 'oauth';
UPDATE creators c SET instagram_verified = true
  FROM social_connections s
  WHERE s.profile_id = c.profile_id AND s.platform = 'instagram' AND s.connection_type = 'oauth';

NOTIFY pgrst, 'reload schema';
