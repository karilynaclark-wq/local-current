// Edge Function: summarize-creator
// Reads a creator's recent TikTok / Instagram posts (already synced into
// social_connections.recent_posts) and asks Claude for a consistent,
// structured summary of what they post about and how local it is.
//
// Body: { creatorId: string, dryRun?: boolean, promptOverride?: string }
//   (cron-secret callers may pass { email } instead of creatorId)
//  - dryRun: return the input + summary without saving (for prompt testing)
//  - promptOverride: replace the instructions (testing only; cron-secret callers)
// Auth: the creator themself, an admin, or the CRON_SECRET header (testing / batch).
// Result is saved to creators.ai_summary / ai_summary_at unless dryRun.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const MODEL = 'claude-haiku-5-5'; // cheapest current model; summaries are short text tasks
const MAX_POSTS_PER_PLATFORM = 20;

export const INSTRUCTIONS = `You summarize a social media creator for Local Current, an app where Chicago businesses give creators free event tickets in exchange for an honest video. Businesses read this summary to decide whether a creator fits their event.

You get the creator's recent posts (platform, date, caption, views). Captions are all you can see, not the videos themselves, so describe only what the captions and hashtags actually support. If captions are sparse or vague, say so and lower your confidence rather than guessing.

Write for a busy business owner: plain, specific, neutral. Name real places, neighborhoods, and topics when captions mention them. Do not flatter or judge the creator, and do not mention follower counts (the app shows those separately).

Field guidance:
- summary: one or two sentences on what they post about and where.
- local_share: fraction of posts (0 to 1) clearly about Chicago or the Chicago area.
- neighborhoods: Chicago neighborhoods or suburbs mentioned, most frequent first. Empty if none.
- topics: 2 to 5 short lowercase topics, most frequent first (e.g. "food", "nightlife", "fitness", "fashion", "comedy", "family").
- content_style: a short phrase on format/tone as far as captions show it (e.g. "casual restaurant reviews", "day-in-the-life vlogs").
- event_fit: "high" if they regularly post local experiences like restaurants, bars, shows, or events; "medium" if some; "low" if rarely.
- confidence: "high", "medium", or "low", based on how many posts there are and how informative the captions are.`;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    local_share: { type: 'number' },
    neighborhoods: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
    content_style: { type: 'string' },
    event_fit: { type: 'string', enum: ['high', 'medium', 'low'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['summary', 'local_share', 'neighborhoods', 'topics', 'content_style', 'event_fit', 'confidence'],
  additionalProperties: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

/** One line per post: "tiktok · 2026-10-25 · 1,204 views · caption". */
function postLines(platform: string, posts: any[]): string[] {
  return (posts ?? []).slice(0, MAX_POSTS_PER_PLATFORM).map((p) => {
    const caption = platform === 'tiktok'
      ? [p.title, p.video_description].filter(Boolean).join(' ')
      : (p.caption ?? '');
    const when = platform === 'tiktok'
      ? (p.create_time ? new Date(Number(p.create_time) * 1000) : null)
      : (p.timestamp ? new Date(p.timestamp) : null);
    const views = p.view_count ?? p.views;
    return [
      platform,
      when ? when.toISOString().slice(0, 10) : 'unknown date',
      views != null ? `${Number(views).toLocaleString('en-US')} views` : null,
      (caption || '(no caption)').replace(/\s+/g, ' ').trim(),
    ].filter(Boolean).join(' · ');
  });
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
    const { creatorId: bodyCreatorId, email, dryRun = false, promptOverride } = await req.json();
    const cronSecret = Deno.env.get('CRON_SECRET');
    const trusted = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;

    // Testing convenience: trusted callers may look a creator up by email.
    let creatorId = bodyCreatorId;
    if (!creatorId && trusted && email) {
      const { data: p } = await db.from('profiles').select('id').eq('email', email).single();
      const { data: c } = p ? await db.from('creators').select('id').eq('profile_id', p.id).single() : { data: null };
      creatorId = c?.id;
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
    const lines = (conns ?? []).flatMap((c: any) => postLines(c.platform, c.recent_posts));
    if (!lines.length) return json({ error: 'No connected posts to summarize' }, 422);

    const handles = (conns ?? []).map((c: any) => `${c.platform}: @${c.username}`).join(', ');
    const userContent = `Creator accounts: ${handles}\n\nRecent posts (${lines.length}):\n${lines.join('\n')}`;

    // ── Claude ──
    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: promptOverride ?? INSTRUCTIONS,
      messages: [{ role: 'user', content: userContent }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
      },
    } as any);

    if (response.stop_reason === 'refusal') return json({ error: 'Model declined', stop_details: (response as any).stop_details }, 502);
    if (response.stop_reason === 'max_tokens') return json({ error: 'Summary was cut off' }, 502);
    const text = response.content.find((b: any) => b.type === 'text') as any;
    const summary = JSON.parse(text?.text ?? '{}');

    if (!dryRun) {
      await db.from('creators')
        .update({ ai_summary: { ...summary, model: MODEL, post_count: lines.length }, ai_summary_at: new Date().toISOString() })
        .eq('id', creatorId);
    }

    return json({
      summary,
      saved: !dryRun,
      ...(dryRun ? { input: userContent } : {}),
      usage: response.usage,
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
