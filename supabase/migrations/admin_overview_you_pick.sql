-- Adds "You pick" stats to admin_overview() (web admin page).
CREATE OR REPLACE FUNCTION admin_overview() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE wk TIMESTAMPTZ := now() - interval '7 days'; pwk TIMESTAMPTZ := now() - interval '14 days';
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN jsonb_build_object(
    'creators',            (SELECT count(*) FROM creators),
    'creators_this_week',  (SELECT count(*) FROM creators c JOIN profiles p ON p.id = c.profile_id WHERE p.created_at >= wk),
    'creators_last_week',  (SELECT count(*) FROM creators c JOIN profiles p ON p.id = c.profile_id WHERE p.created_at >= pwk AND p.created_at < wk),
    'businesses',          (SELECT count(*) FROM businesses),
    'businesses_this_week',(SELECT count(*) FROM businesses WHERE created_at >= wk),
    'businesses_last_week',(SELECT count(*) FROM businesses WHERE created_at >= pwk AND created_at < wk),
    'live_currents',       (SELECT count(*) FROM circuits WHERE is_active),
    'currents_this_week',  (SELECT count(*) FROM circuits WHERE created_at >= wk),
    'claims_this_week',    (SELECT count(*) FROM activity_log WHERE action = 'tickets_claimed' AND created_at >= wk),
    'posts_total',         (SELECT count(*) FROM posts),
    'posts_this_week',     (SELECT count(*) FROM posts WHERE submitted_at >= wk),
    'views_total',         (SELECT coalesce(sum(views), 0) FROM posts),
    -- "You pick" currents
    'you_pick_live',          (SELECT count(*) FROM circuits WHERE is_active AND approval_mode = 'manual'),
    'interest_this_week',     (SELECT count(*) FROM redemptions r JOIN circuits c ON c.id = r.circuit_id
                                WHERE c.approval_mode = 'manual' AND r.requested_at >= wk),
    'picked_this_week',       (SELECT count(*) FROM redemptions WHERE delivery_method IS NOT NULL AND responded_at >= wk),
    'confirmed_this_week',    (SELECT count(*) FROM redemptions WHERE confirmed_at >= wk),
    'released_this_week',     (SELECT count(*) FROM redemptions WHERE delivery_method IS NOT NULL AND status = 'expired' AND responded_at >= wk - interval '3 days'),
    'waiting_to_be_picked',   (SELECT count(*) FROM redemptions r JOIN circuits c ON c.id = r.circuit_id
                                WHERE c.approval_mode = 'manual' AND r.status = 'requested')
  );
END $$;
GRANT EXECUTE ON FUNCTION admin_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
