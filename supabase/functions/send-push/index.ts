// Supabase Edge Function: send-push
// POST { to: profileId | profileIds[], title, body, data? } with the user's JWT.
// Push tokens are looked up here (the app never sees other users' tokens), and
// can_notify() checks the sender is allowed to reach each recipient: admins →
// anyone, anyone → admins, creator ↔ the business whose event they claimed.
//
// Legacy: older app versions send { tokens }. Still accepted until
// security_phase2_after_update.sql hides tokens; remove LEGACY after that.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const LEGACY = true;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const isExpo = (t?: string | null) => !!t && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await db.auth.getUser(jwt);
    const sender = auth?.user?.id;
    if (!sender) return json({ error: 'Sign in required' }, 401);

    const { to, tokens, title, body, data } = await req.json();
    if (typeof title !== 'string' || typeof body !== 'string') return json({ error: 'title and body required' }, 400);

    let targets: string[] = [];
    if (to) {
      const ids = (Array.isArray(to) ? to : [to]).filter((x) => typeof x === 'string').slice(0, 50);
      for (const id of ids) {
        const { data: ok } = await db.rpc('can_notify', { p_from: sender, p_to: id });
        if (!ok) continue;
        const { data: p } = await db.from('profiles').select('push_token').eq('id', id).single();
        if (isExpo(p?.push_token)) targets.push(p!.push_token);
      }
    } else if (LEGACY && Array.isArray(tokens)) {
      targets = tokens.filter(isExpo).slice(0, 10);
    }
    if (!targets.length) return json({ sent: 0 });

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(targets.map((t) => ({
        to: t, title: title.slice(0, 120), body: body.slice(0, 300), data: data ?? {}, sound: 'default',
      }))),
    });
    return json({ sent: targets.length, result: await res.json() });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
