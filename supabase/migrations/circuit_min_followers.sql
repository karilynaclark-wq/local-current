-- Numeric minimum following for a current (e.g. 25000). Matched against
-- creators' verified follower counts, falling back to their self-reported tier.
-- NULL = older currents that use the eligibility_min_followers tier list.
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS min_followers INTEGER;
NOTIFY pgrst, 'reload schema';
