-- Demo events for the TikTok review video. Run in the Supabase SQL editor.
-- Three currents with different follower minimums, so connecting TikTok
-- visibly changes which ones a creator is eligible for.
-- created_at is backdated a week so every follower tier is already open.
-- Uses the business owned by this email — change it if needed.

DO $$
DECLARE
  v_biz UUID;
  v_id  UUID;
  rec   RECORD;
BEGIN
  SELECT b.id INTO v_biz
    FROM businesses b JOIN auth.users u ON u.id = b.profile_id
   WHERE u.email = 'karilynaclark@gmail.com';
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for that email'; END IF;

  FOR rec IN SELECT * FROM (VALUES
    ('Rooftop Jazz Night',      'Live trio, skyline views, and craft cocktails on our West Loop rooftop.', 0,      'https://example.com/jazz',   'JAZZLC',   7),
    ('Wicker Park Comedy Show', 'Chicago''s best up-and-coming comics, two shows only.',                    5000,   'https://example.com/comedy', 'LAUGHLC',  12),
    ('Chef''s Table Preview',   'An exclusive first taste of our new tasting menu.',                       150000, 'https://example.com/chef',   'CHEFLC',   18)
  ) AS t(title, description, min_f, link, code, days_out)
  LOOP
    INSERT INTO circuits (
      business_id, title, description, redemption_type, event_link,
      min_followers, required_platform, eligibility_min_followers, platform_followers,
      max_redemptions, guest_count, code_mode, event_at, expires_at,
      starts_at, is_active, created_at, notified_threshold
    ) VALUES (
      v_biz, rec.title, rec.description, 'code', rec.link,
      rec.min_f, 'either', '', '{}'::jsonb,
      4, 1, 'shared',
      date_trunc('day', now()) + make_interval(days => rec.days_out) + interval '19 hours',
      date_trunc('day', now()) + make_interval(days => rec.days_out) + interval '19 hours',
      current_date, true, now() - interval '7 days', 0  -- 0 = don't push these to real creators
    ) RETURNING id INTO v_id;
    INSERT INTO circuit_codes (circuit_id, code) VALUES (v_id, rec.code);
  END LOOP;
END $$;

-- To remove them after recording:
-- DELETE FROM circuits WHERE title IN ('Rooftop Jazz Night', 'Wicker Park Comedy Show', 'Chef''s Table Preview');
