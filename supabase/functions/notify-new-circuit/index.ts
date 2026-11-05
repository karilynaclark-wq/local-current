// Edge Function: notify-new-circuit
// Push notifications for new currents, staged by follower tier: larger accounts
// get first access and each smaller tier opens 24h later (same schedule as
// src/lib/eligibility.ts currentThreshold and the claim_current RPC).
//
// Two modes:
//  - { circuitId } from the owning business right after publishing: notifies
//    creators whose tier is open now.
//  - Hourly cron (x-cron-secret header): for every live current, notifies the
//    creators whose tier opened since the last run.
// circuits.notified_threshold records the lowest follower count already
// notified, so nobody is notified twice. Push tokens never leave the server.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { layout, hi, p, b, esc, btn, card, recipient, once, send, prefsFooter, appLink } from '../_shared/email.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const DAY = 86_400_000;

// Keep in sync with MIN_FOLLOWER_OPTIONS in src/lib/eligibility.ts.
const STAGES = [150_000, 100_000, 50_000, 25_000, 10_000, 5_000, 0];
const TIER_FLOOR: Record<string, number> = {
  'Under 1K': 0, '1K–5K': 1000, '5K–10K': 5000, '10K–50K': 10000, '50K–100K': 50000, '100K+': 100000,
};

function currentThreshold(min: number, createdAt: string): number {
  const stages = STAGES.filter((v) => v >= min);
  if (!stages.length) return min;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / DAY);
  return stages[Math.min(Math.max(days, 0), stages.length - 1)];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

/** Best follower count on the platforms the current allows (verified, else tier floor). */
function bestCount(c: any, verified: Record<string, Record<string, number>>, requiredPlatform: string): number | null {
  const tiers: Record<string, string> = {};
  if (c.main_platform && c.follower_range) tiers[c.main_platform.toLowerCase()] = c.follower_range;
  if (c.secondary_platform && c.secondary_follower_range) tiers[c.secondary_platform.toLowerCase()] = c.secondary_follower_range;
  const platforms = requiredPlatform === 'tiktok' || requiredPlatform === 'instagram' ? [requiredPlatform] : ['tiktok', 'instagram'];
  let best: number | null = null;
  for (const p of platforms) {
    const n = verified[c.profile_id]?.[p] ?? (tiers[p] != null ? TIER_FLOOR[tiers[p]] : undefined);
    if (n != null && (best == null || n > best)) best = n;
  }
  return best;
}

/**
 * Notify approved creators whose best count is in [from, below) for one current.
 * `below` = null means no upper bound. Returns the number of pushes sent.
 */
async function notifyBand(db: SupabaseClient, circuit: any, from: number, below: number | null, opened: boolean) {
  const { data: creators } = await db
    .from('creators')
    .select('id, profile_id, follower_range, niche, main_platform, secondary_platform, secondary_follower_range, profile:profiles(push_token)')
    .eq('status', 'approved');
  if (!creators?.length) return 0;

  const { data: conns } = await db
    .from('social_connections')
    .select('profile_id, platform, follower_count')
    .eq('connection_type', 'oauth');
  const verified: Record<string, Record<string, number>> = {};
  for (const c of conns ?? []) (verified[c.profile_id] ??= {})[c.platform] = c.follower_count ?? 0;

  // Skip creators who already claimed this current.
  const { data: claimed } = await db.from('redemptions').select('creator_id').eq('circuit_id', circuit.id);
  const claimedIds = new Set((claimed ?? []).map((r: any) => r.creator_id));

  const niches: string[] = Array.isArray(circuit.eligibility_niches) ? circuit.eligibility_niches : [];
  const matching = (creators as any[])
    .filter((c) => {
      if (claimedIds.has(c.id)) return false;
      const n = bestCount(c, verified, circuit.required_platform ?? 'either');
      if (n == null || n < from || (below != null && n >= below)) return false;
      if (niches.length > 0) {
        const mine: string[] = c.niche ? c.niche.split(',').map((x: string) => x.trim()) : [];
        if (!niches.some((x) => mine.includes(x))) return false;
      }
      return true;
    });
  const isToken = (t?: string | null) => !!t && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
  const tokens = matching.map((c) => c.profile?.push_token).filter(isToken) as string[];

  // Email 03: creators with push off get the alert by email instead.
  for (const c of matching.filter((c) => !isToken(c.profile?.push_token))) {
    try {
      if (!(await once(db, `03:${circuit.id}:${c.id}`))) continue;
      const r = await recipient(db, c.profile_id, true);
      if (!r) continue;
      const biz = circuit.business?.business_name || 'A local business';
      const spots = circuit.max_redemptions ?? 0;
      await send(r.email, `Free tickets: ${circuit.title}`, layout({
        tag: 'New event', preview: `${biz} is giving 2 tickets to ${spots} creators. Want in?`,
        body: hi(`Hi ${esc(r.first)}, want to go?`) +
          p(`${b(biz)} wants to give you 2 free tickets to ${b(circuit.title)}. One for you, one for a friend.`) +
          card(esc(biz), esc(circuit.title), esc(circuit.description ?? ''), `${spots} spots`) +
          p(`Only ${spots} creators get in, and it's first come, first served. If you want it, grab it.`) +
          btn('Claim tickets', appLink(`event/${circuit.id}`)),
        footer: await prefsFooter("You're getting this because events are open to your tier.", c.profile_id),
      }));
    } catch (e) { console.error('email 03', e); }
  }
  if (!tokens.length) return 0;

  const businessName = circuit.business?.business_name || 'A local business';
  const eventDate = circuit.event_at
    ? new Date(circuit.event_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
    : null;
  const what = `"${circuit.title}"${eventDate ? ` on ${eventDate}` : ''}`;
  const messages = tokens.map((to) => ({
    to,
    title: 'Free tickets 🎟️',
    body: opened
      ? `${businessName}: ${what} just opened to you. Claim 2 tickets before they're gone.`
      : `${businessName}: ${what}. Claim 2 tickets before they're gone.`,
    sound: 'default',
  }));
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
  return tokens.length;
}

const CIRCUIT_FIELDS =
  'id, title, description, max_redemptions, event_at, created_at, is_active, min_followers, notified_threshold, required_platform, eligibility_niches, business:businesses(business_name, profile_id)';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
      },
    });
  }

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Cron mode: open the next tier on every live current ──
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (req.headers.get('x-cron-secret')) {
      if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'Forbidden' }, 403);
      const { data: circuits } = await db
        .from('circuits')
        .select(CIRCUIT_FIELDS)
        .eq('is_active', true)
        .not('min_followers', 'is', null);
      let sent = 0;
      for (const c of circuits ?? []) {
        // Events usually have no date now; skip only ones whose date has passed.
        if (c.event_at && new Date(c.event_at).getTime() < Date.now()) continue;
        const threshold = currentThreshold(c.min_followers, c.created_at);
        if (c.notified_threshold != null && threshold >= c.notified_threshold) continue;
        // null = the publish-time announcement never went out; send it now.
        sent += await notifyBand(db, c, threshold, c.notified_threshold, c.notified_threshold != null);
        await db.from('circuits').update({ notified_threshold: threshold }).eq('id', c.id);
      }
      return json({ sent });
    }

    // ── Publish mode: called by the owning business ──
    const { circuitId } = await req.json();
    if (!circuitId) return json({ error: 'circuitId required' }, 400);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { data: circuit } = await db.from('circuits').select(CIRCUIT_FIELDS).eq('id', circuitId).single();
    if (!circuit || (circuit as any).business?.profile_id !== user.id) return json({ error: 'Not allowed' }, 403);
    if (circuit.notified_threshold != null) return json({ sent: 0 }); // already announced

    const min = circuit.min_followers ?? 0;
    const threshold = currentThreshold(min, circuit.created_at);
    const sent = await notifyBand(db, circuit, threshold, null, false);
    await db.from('circuits').update({ notified_threshold: threshold }).eq('id', circuitId);
    return json({ sent });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
