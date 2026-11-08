-- Demo: a claimed event with no post yet, to show #localcurrent auto-import.
-- kari.clark16@gmail.com claimed it 3 days ago and the event was 2 nights ago.
-- Any TikTok from the connected account captioned #localcurrent or
-- @localcurrentapp, posted after the claim, gets attached on the next
-- connect/sync.

DO $$
DECLARE
  v_biz     UUID;
  v_creator UUID;
  v_circuit UUID;
  v_event   TIMESTAMPTZ := date_trunc('day', now()) - interval '2 days' + interval '19 hours';
  v_claimed TIMESTAMPTZ := now() - interval '3 days';
BEGIN
  SELECT b.id INTO v_biz FROM businesses b JOIN auth.users u ON u.id = b.profile_id
   WHERE u.email = 'karilynaclark@gmail.com';
  SELECT c.id INTO v_creator FROM creators c JOIN auth.users u ON u.id = c.profile_id
   WHERE u.email = 'kari.clark16@gmail.com';
  IF v_biz IS NULL THEN RAISE EXCEPTION 'Business account not found'; END IF;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Creator account not found'; END IF;

  INSERT INTO circuits (
    business_id, title, description, redemption_type, event_link,
    min_followers, required_platform, eligibility_min_followers, platform_followers,
    max_redemptions, guest_count, code_mode, event_at, expires_at,
    starts_at, is_active, created_at, notified_threshold
  ) VALUES (
    v_biz, 'Pilsen Gallery Night', 'Late-night gallery opening with local artists and a live DJ.', 'code',
    'https://example.com/gallery', 0, 'either', '', '{}'::jsonb,
    4, 1, 'shared', v_event, v_event,
    (v_claimed - interval '2 days')::date, false, v_claimed - interval '2 days', 0
  ) RETURNING id INTO v_circuit;
  INSERT INTO circuit_codes (circuit_id, code) VALUES (v_circuit, 'GALLERYLC');

  -- Got tickets and attended (checked_in = waiting on the post)
  INSERT INTO redemptions (circuit_id, creator_id, status, code, claimed_at, requested_at,
                           responded_at, checked_in_at)
  VALUES (v_circuit, v_creator, 'checked_in', 'GALLERYLC', v_claimed, v_claimed, v_claimed, v_event);
END $$;

-- To remove after recording:
-- DELETE FROM circuits WHERE title = 'Pilsen Gallery Night';
