// Edge Function: summarize-creator
// Reads a creator's recent TikTok / Instagram posts (already synced into
// social_connections.recent_posts) and asks Claude for a consistent,
// structured summary of what they post about and how local it is.
//
// Body: { creatorId: string, dryRun?: boolean, promptOverride?: string }
//   (cron-secret callers may also send { postsText } to test on pasted captions)
//   (cron-secret callers may pass { email } or { profileId } instead of creatorId)
//  - dryRun: return the input + summary without saving (for prompt testing)
//  - promptOverride: replace the instructions (testing only; cron-secret callers)
// Auth: the creator themself, an admin, or the CRON_SECRET header (testing / batch).
// Result is saved to creators.ai_summary / ai_summary_at unless dryRun.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

// Fixed topic list so topics read the same across creators and runs.
export const TOPICS = [
  'food', 'drinks', 'coffee', 'nightlife', 'live music', 'comedy', 'arts & culture',
  'festivals & events', 'sports', 'fitness', 'wellness', 'beauty', 'fashion', 'shopping',
  'family', 'pets', 'outdoors', 'travel', 'lifestyle', 'home & design',
] as const;

// Automatic refreshes (after a sync) only re-run once a summary is this old.
const REFRESH_DAYS = 14;

const MODEL = 'claude-haiku-5-5'; // cheapest current model; summaries are short text tasks
const MAX_POSTS = 30;            // newest across platforms
const MAX_AGE_DAYS = 365;        // older posts don't reflect what they post now

export const INSTRUCTIONS = `You analyze a social media creator's recent posts for Local Current, an app where Chicago businesses give creators free event tickets in exchange for an honest video.

You get the creator's recent posts (platform, date, caption, views). Captions are all you can see, not the videos, so use only what the captions and hashtags actually say. Do not guess.

Fields:
- post_locations: one entry per post, in the order given, labeling where the post takes place:
  "chicago" if the caption names Chicago, a Chicago neighborhood or suburb, a Chicago hashtag, or a venue, event, or show you know is in the Chicago area;
  "elsewhere" if it names another city, state, country, or trip;
  "unknown" if there's no caption or nothing in it indicates a place.
- neighborhoods: Chicago neighborhoods or suburbs literally named in the captions (in words or hashtags), most frequent first. Never infer a neighborhood from a venue name. Empty if none.
- topics: 1 to 4 topics from the allowed list that best describe the posts, most frequent first. "pets" covers dogs and other animals; "drinks" covers bars, cocktails, and breweries; "festivals & events" covers street fests, markets, and one-off events.`;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    post_locations: { type: 'array', items: { type: 'string', enum: ['chicago', 'elsewhere', 'unknown'] } },
    neighborhoods: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string', enum: [...TOPICS] } },
  },
  required: ['post_locations', 'neighborhoods', 'topics'],
  additionalProperties: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

interface PostRow { platform: string; when: Date | null; views: number | null; caption: string }

function toRows(platform: string, posts: any[]): PostRow[] {
  return (posts ?? []).map((p) => {
    // TikTok often repeats the title inside the description; keep one copy.
    const parts = platform === 'tiktok' ? [p.title, p.video_description] : [p.caption];
    const caption = [...new Set(parts.map((x: string) => (x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' ');
    const when = platform === 'tiktok'
      ? (p.create_time ? new Date(Number(p.create_time) * 1000) : null)
      : (p.timestamp ? new Date(p.timestamp) : null);
    const views = p.view_count ?? p.views;
    return { platform, when, views: views != null ? Number(views) : null, caption };
  });
}

/** One line per post: "tiktok · 2026-10-25 · 1,204 views · caption". */
const postLine = (r: PostRow) => [
  r.platform,
  r.when ? r.when.toISOString().slice(0, 10) : 'unknown date',
  r.views != null ? `${r.views.toLocaleString('en-US')} views` : null,
  r.caption || '(no caption)',
].filter(Boolean).join(' · ');

async function summarize(userContent: string, promptOverride?: string): Promise<any> {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: promptOverride ?? INSTRUCTIONS,
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
    },
  } as any);
  if (response.stop_reason === 'refusal') return { error: 'Model declined', stop_details: (response as any).stop_details };
  if (response.stop_reason === 'max_tokens') return { error: 'Summary was cut off' };
  const text = response.content.find((b: any) => b.type === 'text') as any;
  const raw = JSON.parse(text?.text ?? '{}');
  // Local share is computed here, over posts whose location is known, so it's
  // consistent and auditable rather than a number the model estimates.
  const locs: string[] = raw.post_locations ?? [];
  const chicago = locs.filter((l) => l === 'chicago').length;
  const known = chicago + locs.filter((l) => l === 'elsewhere').length;
  return {
    summary: {
      local_share: known ? Math.round((chicago / known) * 100) / 100 : null,
      local_basis: { chicago, elsewhere: known - chicago, unknown: locs.length - known },
      neighborhoods: raw.neighborhoods ?? [],
      topics: raw.topics ?? [],
    },
    post_locations: locs,
    usage: response.usage,
  };
}

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
    const { creatorId: bodyCreatorId, email, profileId, dryRun = false, promptOverride, postsText } = await req.json();
    const cronSecret = Deno.env.get('CRON_SECRET');
    const trusted = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;

    // Testing: trusted callers can summarize pasted captions for any page (not saved).
    if (trusted && postsText) {
      const r = await summarize(String(postsText), promptOverride);
      return json(r);
    }

    // Testing convenience: trusted callers may look a creator up by email.
    let creatorId = bodyCreatorId;
    if (!creatorId && trusted && email) {
      const { data: p } = await db.from('profiles').select('id').eq('email', email).single();
      const { data: c } = p ? await db.from('creators').select('id').eq('profile_id', p.id).single() : { data: null };
      creatorId = c?.id;
    }
    if (!creatorId && trusted && profileId) {
      const { data: c } = await db.from('creators').select('id, ai_summary_at').eq('profile_id', profileId).maybeSingle();
      if (!c) return json({ skipped: 'not a creator' });
      const age = c.ai_summary_at ? Date.now() - new Date(c.ai_summary_at).getTime() : Infinity;
      if (age < REFRESH_DAYS * 86_400_000) return json({ skipped: 'summary is recent' });
      creatorId = c.id;
    }
    if (!creatorId) return json({ error: 'creatorId required' }, 400);

    const { data: creator } = await db.from('creators').select('id, profile_id').eq('id', creatorId).single();
    if (!creator) return json({ error: 'Creator not found' }, 404);

    // ── Auth ──
    if (!trusted) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).single();
      if (user.id !== creator.profile_id && prof?.role !== 'admin') return json({ error: 'Not allowed' }, 403);
      if (promptOverride) return json({ error: 'promptOverride is for testing only' }, 403);
    }

    // ── Input: recent posts from connected accounts ──
    const { data: conns } = await db
      .from('social_connections')
      .select('platform, username, recent_posts')
      .eq('profile_id', creator.profile_id)
      .eq('connection_type', 'oauth');
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    const lines = (conns ?? [])
      .flatMap((c: any) => toRows(c.platform, c.recent_posts))
      .filter((r) => !r.when || r.when.getTime() >= cutoff)
      .sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0))
      .slice(0, MAX_POSTS)
      .map(postLine);
    if (!lines.length) return json({ error: 'No connected posts to summarize' }, 422);

    const handles = (conns ?? []).map((c: any) => `${c.platform}: @${c.username}`).join(', ');
    const userContent = `Creator accounts: ${handles}\n\nRecent posts (${lines.length}):\n${lines.join('\n')}`;

    const r = await summarize(userContent, promptOverride);
    if ('error' in r) return json(r, 502);
    const summary = r.summary;

    if (!dryRun) {
      await db.from('creators')
        .update({ ai_summary: { ...summary, model: MODEL, post_count: lines.length }, ai_summary_at: new Date().toISOString() })
        .eq('id', creatorId);
    }

    return json({
      summary,
      saved: !dryRun,
      ...(dryRun ? { input: userContent } : {}),
      usage: r.usage,
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
