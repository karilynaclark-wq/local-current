-- ── Notifications list + event messaging ───────────────────────────────────
-- 1. notifications: every push (and every alert that would have been a push)
--    is saved here so the bell list matches. Written by edge functions with the
--    service role; owners can read and mark read.
-- 2. messages: one thread per redemption (creator ↔ business), open from the
--    invite/claim until 7 days after the event, then read-only. Text only.
--    Sending goes through send_message() (checks party, open, blocks, filter).
-- 3. message_blocks: either side can block; no more messages either way.
-- Reports reuse problem_reports (report_type 'message', message_id).
-- Safe to run more than once.

-- ── 1. Notifications ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  kind TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_profile_created ON notifications (profile_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own notifications" ON notifications;
CREATE POLICY "read own notifications" ON notifications FOR SELECT TO authenticated USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION mark_notifications_read() RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications SET read_at = now() WHERE profile_id = auth.uid() AND read_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION mark_notifications_read() TO authenticated;

-- ── 2. Messages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id UUID NOT NULL REFERENCES redemptions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages (redemption_id, created_at);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS message_blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE message_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own blocks" ON message_blocks;
CREATE POLICY "read own blocks" ON message_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());

ALTER TABLE problem_reports ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Who is in a thread, and is it open?
CREATE OR REPLACE FUNCTION message_thread(p_redemption_id UUID)
RETURNS TABLE (creator_profile UUID, business_profile UUID, is_open BOOLEAN, closes_at TIMESTAMPTZ,
               circuit_id UUID, circuit_title TEXT, business_name TEXT, creator_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.profile_id, b.profile_id,
         r.status IN ('approved', 'claimed', 'checked_in', 'completed')
           AND now() < x.closes_at,
         x.closes_at, ci.id, ci.title, b.business_name,
         coalesce(nullif('@' || ltrim(coalesce(c.tiktok_handle, c.instagram_handle), '@'), '@'), p.full_name, 'Creator')
    FROM redemptions r
    JOIN creators c ON c.id = r.creator_id
    JOIN profiles p ON p.id = c.profile_id
    JOIN circuits ci ON ci.id = r.circuit_id
    JOIN businesses b ON b.id = ci.business_id
    CROSS JOIN LATERAL (SELECT coalesce(
        (r.going_on + time '21:00') AT TIME ZONE 'America/Chicago',
        ci.event_at,
        coalesce(r.claimed_at, r.requested_at, now()) + interval '30 days') + interval '7 days' AS closes_at) x
   WHERE r.id = p_redemption_id
     AND (auth.uid() IN (c.profile_id, b.profile_id) OR is_admin());
$$;
GRANT EXECUTE ON FUNCTION message_thread(UUID) TO authenticated;

DROP POLICY IF EXISTS "thread parties read messages" ON messages;
CREATE POLICY "thread parties read messages" ON messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM message_thread(redemption_id)));

CREATE OR REPLACE FUNCTION send_message(p_redemption_id UUID, p_body TEXT)
RETURNS messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t   RECORD;
  v_to UUID;
  v_body TEXT := btrim(coalesce(p_body, ''));
  v_msg messages;
BEGIN
  SELECT * INTO t FROM message_thread(p_redemption_id);
  IF t.creator_profile IS NULL OR auth.uid() NOT IN (t.creator_profile, t.business_profile) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT t.is_open THEN RAISE EXCEPTION 'This conversation is closed'; END IF;
  IF v_body = '' THEN RAISE EXCEPTION 'Type a message'; END IF;
  IF char_length(v_body) > 1000 THEN RAISE EXCEPTION 'Keep it under 1,000 characters'; END IF;
  v_to := CASE WHEN auth.uid() = t.creator_profile THEN t.business_profile ELSE t.creator_profile END;
  IF EXISTS (SELECT 1 FROM message_blocks WHERE (blocker_id = auth.uid() AND blocked_id = v_to)
                                            OR (blocker_id = v_to AND blocked_id = auth.uid())) THEN
    RAISE EXCEPTION 'You can''t message this person';
  END IF;
  IF v_body ~* '\m(n[i1]gg(er|a)s?|f[a@]gg?(ot)?s?|k[i1]kes?|sp[i1]cs?|ch[i1]nks?|tr[a@]nn(y|ies)|retards?|wetbacks?|kill yourself|kys)\M' THEN
    RAISE EXCEPTION 'That message breaks our community rules';
  END IF;
  -- Light rate limit: 30 messages per 10 minutes per sender.
  IF (SELECT count(*) FROM messages WHERE sender_id = auth.uid() AND created_at > now() - interval '10 minutes') >= 30 THEN
    RAISE EXCEPTION 'Slow down a little and try again soon';
  END IF;

  INSERT INTO messages (redemption_id, sender_id, body) VALUES (p_redemption_id, auth.uid(), v_body)
  RETURNING * INTO v_msg;
  RETURN v_msg;
END $$;
GRANT EXECUTE ON FUNCTION send_message(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION mark_thread_read(p_redemption_id UUID) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE messages SET read_at = now()
   WHERE redemption_id = p_redemption_id AND sender_id <> auth.uid() AND read_at IS NULL
     AND EXISTS (SELECT 1 FROM message_thread(p_redemption_id));
  UPDATE notifications SET read_at = now()
   WHERE profile_id = auth.uid() AND read_at IS NULL AND url = 'localcurrent://thread/' || p_redemption_id;
$$;
GRANT EXECUTE ON FUNCTION mark_thread_read(UUID) TO authenticated;

-- Unread message counts per thread for the current user (dots on links).
CREATE OR REPLACE FUNCTION unread_message_counts(p_redemption_ids UUID[])
RETURNS TABLE (redemption_id UUID, unread INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.redemption_id, count(*)::INT FROM messages m
   WHERE m.redemption_id = ANY (p_redemption_ids) AND m.sender_id <> auth.uid() AND m.read_at IS NULL
     AND EXISTS (SELECT 1 FROM message_thread(m.redemption_id))
   GROUP BY m.redemption_id;
$$;
GRANT EXECUTE ON FUNCTION unread_message_counts(UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION block_user(p_profile_id UUID) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO message_blocks (blocker_id, blocked_id) VALUES (auth.uid(), p_profile_id) ON CONFLICT DO NOTHING;
$$;
GRANT EXECUTE ON FUNCTION block_user(UUID) TO authenticated;
CREATE OR REPLACE FUNCTION unblock_user(p_profile_id UUID) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM message_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_profile_id;
$$;
GRANT EXECUTE ON FUNCTION unblock_user(UUID) TO authenticated;

-- Admin: read reported threads
DROP POLICY IF EXISTS "admin reads messages" ON messages;
CREATE POLICY "admin reads messages" ON messages FOR SELECT TO authenticated USING (is_admin());

-- Live updates in the app
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
