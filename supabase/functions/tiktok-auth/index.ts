// Edge Function: tiktok-auth
// Secure OAuth broker for connecting a creator's TikTok account.
// Holds the TikTok client secret server-side (never in the app).
//
// Routes (by query param, or presence of `code` for the OAuth callback):
//   ?action=start        (auth: user JWT)  -> { authorizeUrl }
//   ?code=..&state=..    (called by TikTok) -> 302 redirect back into the app
//   ?action=sync         (auth: user JWT)  -> refreshes + returns latest stats
//   ?action=disconnect   (auth: user JWT)  -> removes the connection
//
// Required Supabase secrets:
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI, APP_DEEP_LINK
//   (plus the auto-provided SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TT_AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const TT_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TT_USER = 'https://open.tiktokapis.com/v2/user/info/';
const TT_VIDEOS = 'https://open.tiktokapis.com/v2/video/list/';

const SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';
const USER_FIELDS =
  'open_id,union_id,avatar_url,display_name,username,bio_description,is_verified,profile_deep_link,follower_count,following_count,likes_count,video_count';
const VIDEO_FIELDS =
  'id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time';

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('').slice(0, len);
}

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

// ── Identify the calling user from their Supabase JWT ────────────────────────
async function getUserId(req: Request): Promise<string | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  return user?.id ?? null;
}

// ── Fetch stats + recent videos with a valid access token ────────────────────
async function fetchTikTokData(accessToken: string) {
  const userRes = await fetch(`${TT_USER}?fields=${USER_FIELDS}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userJson = await userRes.json();
  const u = userJson?.data?.user ?? {};

  let posts: unknown[] = [];
  try {
    const vidRes = await fetch(`${TT_VIDEOS}?fields=${VIDEO_FIELDS}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 20 }),
    });
    const vidJson = await vidRes.json();
    posts = vidJson?.data?.videos ?? [];
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

// Record a dated snapshot of the headline stats so we can chart growth later.
async function writeSnapshot(db: ReturnType<typeof admin>, profileId: string, data: {
  follower_count: number; following_count: number; likes_count: number; media_count: number;
}) {
  await db.from('social_stat_snapshots').insert({
    profile_id: profileId,
    platform: 'tiktok',
    follower_count: data.follower_count,
    following_count: data.following_count,
    likes_count: data.likes_count,
    media_count: data.media_count,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const code = url.searchParams.get('code');
  const CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY')!;
  const CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET')!;
  const REDIRECT_URI = Deno.env.get('TIKTOK_REDIRECT_URI')!;
  const APP_DEEP_LINK = Deno.env.get('APP_DEEP_LINK') ?? 'localcurrent://social/tiktok';

  try {
    // ── 1) START: build the TikTok authorize URL for the logged-in user ──────
    if (action === 'start') {
      const userId = await getUserId(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      const state = randomString(32);
      const verifier = randomString(64);
      const challenge = await pkceChallenge(verifier);

      const { error: stateErr } = await admin().from('oauth_states').insert({
        state, profile_id: userId, platform: 'tiktok', code_verifier: verifier,
      });
      if (stateErr) {
        return new Response(JSON.stringify({ error: 'state_insert_failed', detail: stateErr.message }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      const authorizeUrl = `${TT_AUTHORIZE}?` + new URLSearchParams({
        client_key: CLIENT_KEY,
        response_type: 'code',
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();

      return new Response(JSON.stringify({ authorizeUrl }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── 2) CALLBACK: TikTok redirects here with ?code&state ──────────────────
    if (code) {
      const state = url.searchParams.get('state') ?? '';
      const db = admin();

      const { data: stateRow } = await db
        .from('oauth_states').select('*').eq('state', state).single();
      if (!stateRow) {
        return Response.redirect(`${APP_DEEP_LINK}?status=error&reason=bad_state`, 302);
      }

      // Exchange the authorization code for an access token
      const tokenRes = await fetch(TT_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: CLIENT_KEY,
          client_secret: CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
          code_verifier: stateRow.code_verifier,
        }).toString(),
      });
      const token = await tokenRes.json();
      if (!token.access_token) {
        await db.from('oauth_states').delete().eq('state', state);
        return Response.redirect(`${APP_DEEP_LINK}?status=error&reason=token`, 302);
      }

      const data = await fetchTikTokData(token.access_token);

      await db.from('social_connections').upsert({
        profile_id: stateRow.profile_id,
        platform: 'tiktok',
        connection_type: 'oauth',
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_expires_at: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
        scopes: token.scope ?? SCOPES,
        needs_reconnect: false,
        last_synced_at: new Date().toISOString(),
        ...data,
      }, { onConflict: 'profile_id,platform' });

      await writeSnapshot(db, stateRow.profile_id, data);
      await db.from('oauth_states').delete().eq('state', state);

      return Response.redirect(`${APP_DEEP_LINK}?status=success`, 302);
    }

    // ── 3) SYNC: refresh a connected user's stats on demand ──────────────────
    if (action === 'sync' || action === 'disconnect') {
      const userId = await getUserId(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const db = admin();

      if (action === 'disconnect') {
        await db.from('social_connections')
          .delete().eq('profile_id', userId).eq('platform', 'tiktok');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      const { data: conn } = await db.from('social_connections')
        .select('*').eq('profile_id', userId).eq('platform', 'tiktok').single();
      if (!conn) {
        return new Response(JSON.stringify({ error: 'Not connected' }), {
          status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      let accessToken = conn.access_token as string;
      // Refresh if the token has expired and we have a refresh token
      if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date() && conn.refresh_token) {
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
        if (rj.access_token) {
          accessToken = rj.access_token;
          await db.from('social_connections').update({
            access_token: rj.access_token,
            refresh_token: rj.refresh_token ?? conn.refresh_token,
            token_expires_at: rj.expires_in
              ? new Date(Date.now() + rj.expires_in * 1000).toISOString() : null,
          }).eq('id', conn.id);
        }
      }

      const data = await fetchTikTokData(accessToken);
      await db.from('social_connections')
        .update({ ...data, needs_reconnect: false, last_synced_at: new Date().toISOString() })
        .eq('id', conn.id);
      await writeSnapshot(db, userId, data);

      return new Response(JSON.stringify({ success: true, ...data }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
