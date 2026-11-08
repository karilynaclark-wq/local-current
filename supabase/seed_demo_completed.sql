-- Demo: a completed current for the TikTok review video.
-- Creator kari.clark16@gmail.com attended a past event from the
-- karilynaclark@gmail.com business and posted a TikTok about it.
-- The post is the TikTok in v_fallback_url. If the creator has connected
-- TikTok and that video is among their recent ones, its real stats are used.

DO $$
DECLARE
  v_biz      UUID;
  v_creator  UUID;
  v_profile  UUID;
  v_circuit  UUID;
  v_red      UUID;
  v_video    JSONB;
  v_url      TEXT;
  v_fallback_url TEXT := 'https://www.tiktok.com/@karilynaclark/video/7700606305894944031';
  v_event    TIMESTAMPTZ := date_trunc('day', now()) - interval '6 days' + interval '19 hours';
BEGIN
  SELECT b.id INTO v_biz FROM businesses b JOIN auth.users u ON u.id = b.profile_id
   WHERE u.email = 'karilynaclark@gmail.com';
  SELECT c.id, c.profile_id INTO v_creator, v_profile FROM creators c JOIN auth.users u ON u.id = c.profile_id
   WHERE u.email = 'kari.clark16@gmail.com';
  IF v_biz IS NULL THEN RAISE EXCEPTION 'Business account not found'; END IF;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Creator account not found'; END IF;

  -- Prefer the chosen video; pull its stats from the connected account if it's
  -- among the recent videos, otherwise fall back to the most recent video.
  SELECT coalesce(
           (SELECT p FROM jsonb_array_elements(sc.recent_posts) p
             WHERE nullif(v_fallback_url, '') IS NOT NULL
               AND v_fallback_url LIKE '%' || (p ->> 'id') || '%' LIMIT 1),
           CASE WHEN nullif(v_fallback_url, '') IS NULL THEN sc.recent_posts -> 0 END)
    INTO v_video
    FROM social_connections sc
   WHERE sc.profile_id = v_profile AND sc.platform = 'tiktok' LIMIT 1;
  v_url := coalesce(nullif(v_fallback_url, ''), nullif(v_video ->> 'share_url', ''));
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'No TikTok video found. Connect TikTok in the app, or set v_fallback_url.';
  END IF;

  INSERT INTO circuits (
    business_id, title, description, redemption_type, event_link,
    min_followers, required_platform, eligibility_min_followers, platform_followers,
    max_redemptions, guest_count, code_mode, event_at, expires_at,
    starts_at, is_active, created_at, notified_threshold
  ) VALUES (
    v_biz, 'Logan Square Taco Night', 'Street tacos, mezcal flights, and a live DJ.', 'code',
    'https://example.com/tacos', 0, 'either', '', '{}'::jsonb,
    4, 1, 'shared', v_event, v_event,
    (v_event - interval '14 days')::date, false, v_event - interval '14 days', 0
  ) RETURNING id INTO v_circuit;
  INSERT INTO circuit_codes (circuit_id, code) VALUES (v_circuit, 'TACOLC');

  INSERT INTO redemptions (circuit_id, creator_id, status, code, claimed_at, requested_at,
                           responded_at, checked_in_at, redeemed_at)
  VALUES (v_circuit, v_creator, 'completed', 'TACOLC', v_event - interval '10 days',
          v_event - interval '10 days', v_event - interval '10 days', v_event, v_event + interval '4 hours')
  RETURNING id INTO v_red;

  INSERT INTO posts (redemption_id, creator_id, business_id, video_url, platform,
                     views, likes, comments, submitted_at)
  VALUES (v_red, v_creator, v_biz, v_url, 'tiktok',
          (v_video ->> 'view_count')::int, (v_video ->> 'like_count')::int,
          (v_video ->> 'comment_count')::int, v_event + interval '20 hours');
END $$;

-- To remove after recording:
-- DELETE FROM circuits WHERE title = 'Logan Square Taco Night';
