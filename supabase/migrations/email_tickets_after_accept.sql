-- Email-ticket invites: the business only sees the creator's email after the
-- creator accepts, then marks "tickets sent".
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS tickets_sent_at TIMESTAMPTZ;

-- Emails: guest list right away; email method only after the creator accepts.
CREATE OR REPLACE FUNCTION approved_creator_emails(p_circuit_id UUID)
RETURNS TABLE (redemption_id UUID, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, u.email::TEXT
    FROM redemptions r
    JOIN circuits ci ON ci.id = r.circuit_id
    JOIN businesses b ON b.id = ci.business_id
    JOIN creators c ON c.id = r.creator_id
    JOIN auth.users u ON u.id = c.profile_id
   WHERE r.circuit_id = p_circuit_id AND b.profile_id = auth.uid()
     AND r.status IN ('approved', 'claimed', 'checked_in', 'completed')
     AND (r.delivery_method = 'guest_list'
          OR (r.delivery_method = 'email' AND r.confirmed_at IS NOT NULL));
$$;

-- Business: "I've sent the tickets"
CREATE OR REPLACE FUNCTION mark_tickets_sent(p_redemption_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE redemptions r SET tickets_sent_at = now()
    FROM circuits ci JOIN businesses b ON b.id = ci.business_id
   WHERE r.id = p_redemption_id AND ci.id = r.circuit_id AND b.profile_id = auth.uid()
     AND r.delivery_method = 'email' AND r.confirmed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'They need to accept the invite first'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION mark_tickets_sent(UUID) TO authenticated;

-- approve_request: don't hand back the email for the email method anymore.
DO $$
DECLARE src TEXT;
BEGIN
  SELECT pg_get_functiondef('approve_request(uuid,text,text,date)'::regprocedure) INTO src;
  src := replace(src, 'IF p_method <> ''code'' THEN', 'IF p_method = ''guest_list'' THEN');
  EXECUTE src;
END $$;

NOTIFY pgrst, 'reload schema';
