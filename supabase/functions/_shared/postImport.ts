// Shared helper: attach a creator's tagged TikTok/Instagram posts to their
// claims, and refresh the stats of posts we already track.
//
// Called after every sync of a connected account (on connect and by the daily
// sync crons) with the account's recent posts:
//  - A post already recorded (same video id, or a manually submitted link to
//    the same video) gets its stats updated, tagged or not.
//  - A new post whose caption has #localcurrentapp or @localcurrentapp is matched
//    to the creator's claim whose event it most likely covers, recorded as an
//    'auto' post, and the claim is marked completed.
// Every touched post gets a row in post_stat_snapshots.

// deno-lint-ignore no-explicit-any
type Db = any;

// #localcurrentapp is the official tag; plain #localcurrent is still accepted for older posts.
const TAG_RE = /(^|[^a-z0-9_])(#localcurrentapp|#localcurrent|@localcurrentapp)(?![a-z0-9_])/i;
const DAY = 86_400_000;
// A post counts for a claim if it goes up after the claim and within 7 days of
// the visit (event date, or the day the creator said they booked). With
// neither, it counts for 60 days after claiming.
const POST_WINDOW_DAYS = 7;
const NO_DATE_WINDOW_DAYS = 60;
const OPEN_STATUSES = ['approved', 'claimed', 'checked_in', 'completed'];

export interface NormalizedPost {
  id: string;
  url: string;
  caption: string;
  postedAt: Date | null;
  thumbnail: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
}

const num = (v: unknown) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

export function normalizeTikTok(v: any): NormalizedPost | null {
  if (!v?.id) return null;
  return {
    id: String(v.id),
    url: v.share_url || `https://www.tiktok.com/video/${v.id}`,
    caption: [v.title, v.video_description].filter(Boolean).join(' '),
    postedAt: v.create_time ? new Date(Number(v.create_time) * 1000) : null,
    thumbnail: v.cover_image_url ?? null,
    views: num(v.view_count),
    likes: num(v.like_count),
    comments: num(v.comment_count),
    shares: num(v.share_count),
    saves: null,
    reach: null,
  };
}

export function normalizeInstagram(m: any): NormalizedPost | null {
  if (!m?.id) return null;
  return {
    id: String(m.id),
    url: m.permalink ?? '',
    caption: m.caption ?? '',
    postedAt: m.timestamp ? new Date(m.timestamp) : null,
    thumbnail: m.thumbnail_url ?? m.media_url ?? null,
    views: num(m.views),
    likes: num(m.like_count),
    comments: num(m.comments_count),
    shares: num(m.shares),
    saves: num(m.saved),
    reach: num(m.reach),
  };
}

/**
 * Instagram views/reach/saves/shares live behind the insights permission
 * (instagram_business_manage_insights). Best effort: without it the post keeps
 * likes + comments only.
 */
export async function addInstagramInsights(post: NormalizedPost, accessToken: string): Promise<void> {
  try {
    const res = await fetch(
      `https://graph.instagram.com/${post.id}/insights?metric=views,reach,saved,shares&access_token=${encodeURIComponent(accessToken)}`,
    );
    const j = await res.json();
    for (const m of j?.data ?? []) {
      const v = num(m?.values?.[0]?.value ?? m?.total_value?.value);
      if (m.name === 'views') post.views = v;
      if (m.name === 'reach') post.reach = v;
      if (m.name === 'saved') post.saves = v;
      if (m.name === 'shares') post.shares = v;
    }
  } catch (_) { /* insights are optional */ }
}

/** When the creator goes: the event's date, else the date they said they booked. */
function visitTime(c: any): number | null {
  const v = c.circuit?.event_at ?? c.checked_in_at;
  return v ? new Date(v).getTime() : null;
}

export const isTagged = (caption: string) => TAG_RE.test(caption ?? '');

/** Strip query strings so manual links match the platform's share URL. */
const cleanUrl = (u: string | null | undefined) => (u ?? '').split('?')[0].replace(/\/$/, '').toLowerCase();

export async function importTaggedPosts(
  db: Db,
  profileId: string,
  platform: 'tiktok' | 'instagram',
  posts: NormalizedPost[],
  igAccessToken?: string,
): Promise<{ imported: number; updated: number }> {
  const result = { imported: 0, updated: 0 };
  if (!posts.length) return result;

  const { data: creator } = await db.from('creators').select('id').eq('profile_id', profileId).maybeSingle();
  if (!creator) return result;

  const { data: existing } = await db
    .from('posts')
    .select('id, redemption_id, video_url, external_post_id')
    .eq('creator_id', creator.id)
    .eq('platform', platform);
  const tracked = (existing ?? []) as { id: string; redemption_id: string; video_url: string; external_post_id: string | null }[];

  const { data: claims } = await db
    .from('redemptions')
    .select('id, status, claimed_at, checked_in_at, redeemed_at, circuit:circuits(id, business_id, event_at)')
    .eq('creator_id', creator.id)
    .in('status', OPEN_STATUSES);
  const claimsWithPost = new Set(tracked.map((t) => t.redemption_id));

  for (const post of posts) {
    const match = tracked.find((t) =>
      (t.external_post_id && t.external_post_id === post.id) ||
      (post.url && cleanUrl(t.video_url) === cleanUrl(post.url)) ||
      (t.video_url ?? '').includes(post.id));

    if (!match && !isTagged(post.caption)) continue;
    if (platform === 'instagram' && igAccessToken) await addInstagramInsights(post, igAccessToken);

    const stats = {
      views: post.views, likes: post.likes, comments: post.comments,
      shares: post.shares, saves: post.saves, reach: post.reach,
    };

    if (match) {
      await db.from('posts').update({
        ...stats,
        external_post_id: post.id,
        caption: post.caption || null,
        thumbnail_url: post.thumbnail,
        posted_at: post.postedAt?.toISOString() ?? null,
        stats_updated_at: new Date().toISOString(),
      }).eq('id', match.id);
      await db.from('post_stat_snapshots').insert({ post_id: match.id, ...stats });
      result.updated++;
      continue;
    }

    // New tagged post → the claim whose event it most likely covers: posted
    // after the claim and within POST_WINDOW_DAYS of the event, nearest event.
    const postedMs = post.postedAt?.getTime() ?? Date.now();
    const candidates = (claims ?? [])
      .filter((c: any) => !claimsWithPost.has(c.id) && c.circuit)
      .filter((c: any) => {
        const claimed = c.claimed_at ? new Date(c.claimed_at).getTime() : 0;
        const visit = visitTime(c);
        const until = visit != null ? visit + POST_WINDOW_DAYS * DAY : claimed + NO_DATE_WINDOW_DAYS * DAY;
        return postedMs >= claimed && postedMs <= until;
      })
      .sort((a: any, b: any) =>
        Math.abs(postedMs - (visitTime(a) ?? new Date(a.claimed_at).getTime())) -
        Math.abs(postedMs - (visitTime(b) ?? new Date(b.claimed_at).getTime())));
    const claim = candidates[0];
    if (!claim) continue;

    const { data: inserted, error } = await db.from('posts').insert({
      redemption_id: claim.id,
      creator_id: creator.id,
      business_id: claim.circuit.business_id,
      video_url: post.url,
      platform,
      ...stats,
      external_post_id: post.id,
      caption: post.caption || null,
      thumbnail_url: post.thumbnail,
      posted_at: post.postedAt?.toISOString() ?? null,
      submitted_at: new Date().toISOString(),
      stats_updated_at: new Date().toISOString(),
      source: 'auto',
    }).select('id').single();
    if (error || !inserted) continue;

    await db.from('post_stat_snapshots').insert({ post_id: inserted.id, ...stats });
    const eventAt = claim.circuit.event_at ?? claim.checked_in_at ?? new Date().toISOString();
    await db.from('redemptions').update({
      status: 'completed',
      checked_in_at: claim.checked_in_at ?? eventAt,
      redeemed_at: claim.redeemed_at ?? new Date().toISOString(),
    }).eq('id', claim.id);
    claimsWithPost.add(claim.id);
    tracked.push({ id: inserted.id, redemption_id: claim.id, video_url: post.url, external_post_id: post.id });
    result.imported++;
  }

  return result;
}
