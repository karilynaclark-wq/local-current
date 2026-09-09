-- Track whether business was notified when circuit expired with 0 claims
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS expired_notified BOOLEAN DEFAULT FALSE;

-- Track when business was notified to rate (so we don't double-notify)
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_rating_notified TIMESTAMPTZ;

-- Business-to-creator rating fields on redemptions
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_rating INTEGER;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_public_review TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_private_review TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_app_feedback TEXT;
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS business_rated_at TIMESTAMPTZ;
