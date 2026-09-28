// Cron Edge Function: expire-requests
// Run hourly.
//  • Requests pending > 24h: remind the business once (business_reminder_sent).
//  • Requests pending > 48h: mark 'expired' and tell the creator.
// Protected by the CRON_SECRET header, like the other cron functions.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const HOUR = 3_600_000;

serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  async function push(profileId: string | null | undefined, title: string, body: string) {
    if (!profileId) return;
    const { data: p } = await db.from('profiles').select('push_token').eq('id', profileId).single();
    if (!p?.push_token) return;
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ to: p.push_token, title, body, sound: 'default' }]),
    });
  }

  const now = Date.now();

  // ── Expire (> 48h) ───────────────────────────────────────────────────────
  const { data: stale } = await db
    .from('redemptions')
    .select('id, creator:creators(profile_id), circuit:circuits(title)')
    .eq('status', 'requested')
    .lt('requested_at', new Date(now - 48 * HOUR).toISOString());

  let expired = 0;
  for (const r of stale ?? []) {
    const { error } = await db.from('redemptions').update({ status: 'expired' }).eq('id', r.id).eq('status', 'requested');
    if (error) { console.error('expire failed', r.id, error.message); continue; }
    expired++;
    await push(
      (r.creator as any)?.profile_id,
      'Request expired',
      `"${(r.circuit as any)?.title ?? 'A current'}" didn't respond in time. Browse other currents to request.`,
    );
  }

  // ── Remind business (> 24h, once) ─────────────────────────────────────────
  const { data: waiting } = await db
    .from('redemptions')
    .select('id, circuit:circuits(id, title, business:businesses(profile_id))')
    .eq('status', 'requested')
    .eq('business_reminder_sent', false)
    .lt('requested_at', new Date(now - 24 * HOUR).toISOString());

  // One push per current, however many requests are waiting on it.
  const byCircuit = new Map<string, { title: string; profileId: string | null; ids: string[] }>();
  for (const r of waiting ?? []) {
    const c = r.circuit as any;
    if (!c) continue;
    const entry = byCircuit.get(c.id) ?? { title: c.title, profileId: c.business?.profile_id ?? null, ids: [] };
    entry.ids.push(r.id);
    byCircuit.set(c.id, entry);
  }

  let reminded = 0;
  for (const { title, profileId, ids } of byCircuit.values()) {
    await push(
      profileId,
      'Creators are waiting ⏳',
      `${ids.length} request${ids.length > 1 ? 's' : ''} for "${title}" will expire in 24 hours. Tap to review.`,
    );
    await db.from('redemptions').update({ business_reminder_sent: true }).in('id', ids);
    reminded += ids.length;
  }

  return new Response(JSON.stringify({ expired, reminded }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
