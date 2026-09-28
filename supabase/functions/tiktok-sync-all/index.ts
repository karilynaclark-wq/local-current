// Cron Edge Function: tiktok-sync-all
// Run daily. For every OAuth-connected TikTok account: refresh the token if
// needed, re-pull stats + posts, update the connection, and record a dated
// snapshot for growth tracking. If a token can't be refreshed, flag the
// connection as needing reconnect (cleared next time the user links again).
//
// Optional protection: if CRON_SECRET is set, callers must send it as the
// `x-cron-secret` header. Uses the same secrets as tiktok-auth.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { syncCreatorFromVerified } from '../_shared/creatorSync.ts';

const TT_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TT_USER = 'https://open.tiktokapis.com/v2/user/info/';
const TT_VIDEOS = 'https://open.tiktokapis.com/v2/video/list/';
const USER_FIELDS =
  'open_id,union_id,avatar_url,display_name,username,bio_description,is_verified,profile_deep_link,follower_count,following_count,likes_count,video_count';
const VIDEO_FIELDS =
  'id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time';

async function fetchTikTokData(accessToken: string) {
  const userRes = await fetch(`${TT_USER}?fields=${USER_FIELDS}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const u = (await userRes.json())?.data?.user ?? {};

  let posts: unknown[] = [];
  try {
    const vidRes = await fetch(`${TT_VIDEOS}?fields=${VIDEO_FIELDS}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 20 }),
    });
    posts = (await vidRes.json())?.data?.videos ?? [];
  } catch (_) { /* posts are best-effort */ }

  return {
    external_user_id: u.open_id ?? null,
    username: u.username ?? u.display_name ?? null,
    avatar_url: u.avatar_url ?? null,
    profile_url: u.username ? `https://www.tiktok.com/@${u.username}` : null,
    bio: u.bio_description ?? null,
    is_verified: u.is_verified ?? false,
    profile_deep_link: u.profile_deep_link ?? null,
    follower_count: u.follower_count ?? 0,
    following_count: u.following_count ?? 0,
    likes_count: u.likes_count ?? 0,
    media_count: u.video_count ?? 0,
    recent_posts: posts,
  };
}

serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY')!;
  const CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET')!;

  const { data: conns } = await db
    .from('social_connections')
    .select('*')
    .eq('platform', 'tiktok')
    .eq('connection_type', 'oauth');

  let synced = 0, reconnect = 0;

  for (const conn of conns ?? []) {
    try {
      let accessToken = conn.access_token as string;

      // Refresh if expired (with a 5-min safety margin) and we have a refresh token.
      const expired = conn.token_expires_at &&
        new Date(conn.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000;
      if (expired) {
        if (!conn.refresh_token) {
          await db.from('social_connections').update({ needs_reconnect: true }).eq('id', conn.id);
          reconnect++;
          continue;
        }
        const r = await fetch(TT_TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: conn.refresh_token,
          }).toString(),
        });
        const rj = await r.json();
        if (!rj.access_token) {
          await db.from('social_connections').update({ needs_reconnect: true }).eq('id', conn.id);
          reconnect++;
          continue;
        }
        accessToken = rj.access_token;
        await db.from('social_connections').update({
          access_token: rj.access_token,
          refresh_token: rj.refresh_token ?? conn.refresh_token,
          token_expires_at: rj.expires_in
            ? new Date(Date.now() + rj.expires_in * 1000).toISOString() : null,
        }).eq('id', conn.id);
      }

      const data = await fetchTikTokData(accessToken);
      await db.from('social_connections')
        .update({ ...data, needs_reconnect: false, last_synced_at: new Date().toISOString() })
        .eq('id', conn.id);
      await db.from('social_stat_snapshots').insert({
        profile_id: conn.profile_id,
        platform: 'tiktok',
        follower_count: data.follower_count,
        following_count: data.following_count,
        likes_count: data.likes_count,
        media_count: data.media_count,
      });
      await syncCreatorFromVerified(db, conn.profile_id, 'tiktok', data.username, data.follower_count);
      synced++;
    } catch (err) {
      console.error(`sync failed for connection ${conn.id}:`, (err as Error).message);
    }
  }

  return new Response(JSON.stringify({ synced, needs_reconnect: reconnect }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
