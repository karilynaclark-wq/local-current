// Cron Edge Function: instagram-sync-all
// Run daily. For every OAuth-connected Instagram account: refresh the
// long-lived token when <15 days remain (tokens last 60 days and must be ≥24h
// old to refresh), re-pull stats + media, and record a dated snapshot. If the
// token is expired or rejected, flag the connection as needing reconnect.
//
// Protected by the same CRON_SECRET header as tiktok-sync-all.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { syncCreatorFromVerified } from '../_shared/creatorSync.ts';

const IG_REFRESH = 'https://graph.instagram.com/refresh_access_token';
const IG_GRAPH = 'https://graph.instagram.com';
const USER_FIELDS =
  'user_id,username,name,account_type,profile_picture_url,biography,followers_count,follows_count,media_count';
const MEDIA_FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';

async function fetchInstagramData(accessToken: string) {
  const u = await (await fetch(`${IG_GRAPH}/me?fields=${USER_FIELDS}&access_token=${encodeURIComponent(accessToken)}`)).json();
  if (u.error) throw new Error(u.error.message ?? 'profile fetch failed');

  let posts: unknown[] = [];
  try {
    posts = (await (await fetch(`${IG_GRAPH}/me/media?fields=${MEDIA_FIELDS}&limit=20&access_token=${encodeURIComponent(accessToken)}`)).json())?.data ?? [];
  } catch (_) { /* best-effort */ }

  return {
    username: u.username ?? null,
    avatar_url: u.profile_picture_url ?? null,
    profile_url: u.username ? `https://www.instagram.com/${u.username}` : null,
    bio: u.biography ?? null,
    follower_count: u.followers_count ?? 0,
    following_count: u.follows_count ?? 0,
    media_count: u.media_count ?? 0,
    recent_posts: posts,
  };
}

serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: conns } = await db
    .from('social_connections')
    .select('*')
    .eq('platform', 'instagram')
    .eq('connection_type', 'oauth');

  let synced = 0, reconnect = 0;

  for (const conn of conns ?? []) {
    try {
      let accessToken = conn.access_token as string;
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;

      if (expiresAt && expiresAt < Date.now()) {
        await db.from('social_connections').update({ needs_reconnect: true }).eq('id', conn.id);
        reconnect++;
        continue;
      }

      if (expiresAt && expiresAt - Date.now() < 15 * 24 * 3600 * 1000) {
        const rj = await (await fetch(`${IG_REFRESH}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`)).json();
        if (rj.access_token) {
          accessToken = rj.access_token;
          await db.from('social_connections').update({
            access_token: rj.access_token,
            token_expires_at: rj.expires_in ? new Date(Date.now() + rj.expires_in * 1000).toISOString() : null,
          }).eq('id', conn.id);
        }
      }

      let data;
      try {
        data = await fetchInstagramData(accessToken);
      } catch (_) {
        await db.from('social_connections').update({ needs_reconnect: true }).eq('id', conn.id);
        reconnect++;
        continue;
      }

      await db.from('social_connections')
        .update({ ...data, needs_reconnect: false, last_synced_at: new Date().toISOString() })
        .eq('id', conn.id);
      await db.from('social_stat_snapshots').insert({
        profile_id: conn.profile_id,
        platform: 'instagram',
        follower_count: data.follower_count,
        following_count: data.following_count,
        likes_count: 0,
        media_count: data.media_count,
      });
      await syncCreatorFromVerified(db, conn.profile_id, 'instagram', data.username, data.follower_count);
      synced++;
    } catch (err) {
      console.error(`instagram sync failed for ${conn.id}:`, (err as Error).message);
    }
  }

  return new Response(JSON.stringify({ synced, needs_reconnect: reconnect }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
