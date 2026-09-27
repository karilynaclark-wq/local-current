// Edge Function: instagram-auth
// Secure OAuth broker for connecting a creator's Instagram (Business/Creator)
// account via "Instagram API with Instagram Login". Holds the app secret
// server-side. Personal accounts are not supported by the API — the app offers
// a manual fallback for those.
//
// Routes:
//   ?action=start        (auth: user JWT)  -> { authorizeUrl }
//   ?code=..&state=..    (Instagram redirect) -> 302 back into the app
//   ?error=..&state=..   (user denied)     -> 302 back into the app
//   ?action=sync         (auth: user JWT)  -> refreshes + returns latest stats
//   ?action=disconnect   (auth: user JWT)  -> removes the connection
//
// Required secrets: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET,
//   INSTAGRAM_REDIRECT_URI, INSTAGRAM_APP_DEEP_LINK (optional)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IG_AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN = 'https://api.instagram.com/oauth/access_token';
const IG_LONG_TOKEN = 'https://graph.instagram.com/access_token';
const IG_REFRESH = 'https://graph.instagram.com/refresh_access_token';
const IG_GRAPH = 'https://graph.instagram.com';

const SCOPES = 'instagram_business_basic';
const USER_FIELDS =
  'user_id,username,name,account_type,profile_picture_url,biography,followers_count,follows_count,media_count';
const MEDIA_FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function randomString(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('').slice(0, len);
}

async function getUserId(req: Request): Promise<string | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  return user?.id ?? null;
}

// Pull profile, stats, and recent media with a valid access token.
async function fetchInstagramData(accessToken: string) {
  const uRes = await fetch(`${IG_GRAPH}/me?fields=${USER_FIELDS}&access_token=${encodeURIComponent(accessToken)}`);
  const u = await uRes.json();
  if (u.error) throw new Error(u.error.message ?? 'Instagram profile fetch failed');

  let posts: unknown[] = [];
  try {
    const mRes = await fetch(`${IG_GRAPH}/me/media?fields=${MEDIA_FIELDS}&limit=20&access_token=${encodeURIComponent(accessToken)}`);
    posts = (await mRes.json())?.data ?? [];
  } catch (_) { /* media is best-effort */ }

  return {
    external_user_id: u.user_id ? String(u.user_id) : (u.id ?? null),
    username: u.username ?? null,
    avatar_url: u.profile_picture_url ?? null,
    profile_url: u.username ? `https://www.instagram.com/${u.username}` : null,
    bio: u.biography ?? null,
    is_verified: false, // not exposed by this API
    profile_deep_link: null,
    follower_count: u.followers_count ?? 0,
    following_count: u.follows_count ?? 0,
    likes_count: 0, // not exposed at account level
    media_count: u.media_count ?? 0,
    recent_posts: posts,
  };
}

async function writeSnapshot(db: ReturnType<typeof admin>, profileId: string, data: {
  follower_count: number; following_count: number; likes_count: number; media_count: number;
}) {
  await db.from('social_stat_snapshots').insert({
    profile_id: profileId, platform: 'instagram',
    follower_count: data.follower_count, following_count: data.following_count,
    likes_count: data.likes_count, media_count: data.media_count,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  const APP_ID = Deno.env.get('INSTAGRAM_APP_ID');
  const APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET');
  const REDIRECT_URI = Deno.env.get('INSTAGRAM_REDIRECT_URI');
  const APP_DEEP_LINK = Deno.env.get('INSTAGRAM_APP_DEEP_LINK') ?? 'localcurrent://social/instagram';
  const configured = !!(APP_ID && APP_SECRET && REDIRECT_URI);

  try {
    // ── 1) START ───────────────────────────────────────────────────────────
    if (action === 'start') {
      if (!configured) return json({ error: 'not_configured' }, 503);
      const userId = await getUserId(req);
      if (!userId) return json({ error: 'Unauthorized' }, 401);

      const state = randomString(32);
      // code_verifier is unused for Instagram (no PKCE); column is NOT NULL.
      const { error: stateErr } = await admin().from('oauth_states').insert({
        state, profile_id: userId, platform: 'instagram', code_verifier: '-',
      });
      if (stateErr) return json({ error: 'state_insert_failed', detail: stateErr.message }, 500);

      const authorizeUrl = `${IG_AUTHORIZE}?` + new URLSearchParams({
        client_id: APP_ID!,
        redirect_uri: REDIRECT_URI!,
        response_type: 'code',
        scope: SCOPES,
        state,
      }).toString();
      return json({ authorizeUrl });
    }

    // ── 2) CALLBACK: user denied ───────────────────────────────────────────
    if (oauthError && !code) {
      const state = url.searchParams.get('state');
      if (state) await admin().from('oauth_states').delete().eq('state', state);
      return Response.redirect(`${APP_DEEP_LINK}?status=cancel`, 302);
    }

    // ── 3) CALLBACK: code → short-lived → long-lived token ─────────────────
    if (code) {
      if (!configured) return Response.redirect(`${APP_DEEP_LINK}?status=error&reason=not_configured`, 302);
      const state = url.searchParams.get('state') ?? '';
      const db = admin();

      const { data: stateRow } = await db
        .from('oauth_states').select('*').eq('state', state).eq('platform', 'instagram').single();
      if (!stateRow) return Response.redirect(`${APP_DEEP_LINK}?status=error&reason=bad_state`, 302);
      await db.from('oauth_states').delete().eq('state', state);

      // Instagram appends "#_" to the code in some flows; strip defensively.
      const cleanCode = code.replace(/#_$/, '');

      const shortRes = await fetch(IG_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: APP_ID!,
          client_secret: APP_SECRET!,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI!,
          code: cleanCode,
        }).toString(),
      });
      const shortJson = await shortRes.json();
      // Newer API versions wrap the payload in data[]; handle both shapes.
      const short = Array.isArray(shortJson?.data) ? shortJson.data[0] : shortJson;
      if (!short?.access_token) {
        return Response.redirect(`${APP_DEEP_LINK}?status=error&reason=token`, 302);
      }

      const longRes = await fetch(
        `${IG_LONG_TOKEN}?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(APP_SECRET!)}&access_token=${encodeURIComponent(short.access_token)}`,
      );
      const long = await longRes.json();
      const accessToken: string = long.access_token ?? short.access_token;
      const expiresIn: number | undefined = long.expires_in;

      let data;
      try {
        data = await fetchInstagramData(accessToken);
      } catch (_) {
        // Most common cause: a personal (non-professional) account.
        return Response.redirect(`${APP_DEEP_LINK}?status=error&reason=account_type`, 302);
      }

      await db.from('social_connections').upsert({
        profile_id: stateRow.profile_id,
        platform: 'instagram',
        connection_type: 'oauth',
        access_token: accessToken,
        refresh_token: null,
        token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        scopes: SCOPES,
        needs_reconnect: false,
        last_synced_at: new Date().toISOString(),
        ...data,
      }, { onConflict: 'profile_id,platform' });

      await writeSnapshot(db, stateRow.profile_id, data);
      return Response.redirect(`${APP_DEEP_LINK}?status=success`, 302);
    }

    // ── 4) SYNC / DISCONNECT ───────────────────────────────────────────────
    if (action === 'sync' || action === 'disconnect') {
      const userId = await getUserId(req);
      if (!userId) return json({ error: 'Unauthorized' }, 401);
      const db = admin();

      if (action === 'disconnect') {
        await db.from('social_connections').delete().eq('profile_id', userId).eq('platform', 'instagram');
        return json({ success: true });
      }

      const { data: conn } = await db.from('social_connections')
        .select('*').eq('profile_id', userId).eq('platform', 'instagram').single();
      if (!conn || conn.connection_type !== 'oauth') return json({ error: 'Not connected' }, 404);

      let accessToken = conn.access_token as string;
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
      // Refresh when <15 days remain (token must be ≥24h old; 60-day lifetime).
      if (expiresAt && expiresAt - Date.now() < 15 * 24 * 3600 * 1000) {
        const r = await fetch(`${IG_REFRESH}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`);
        const rj = await r.json();
        if (rj.access_token) {
          accessToken = rj.access_token;
          await db.from('social_connections').update({
            access_token: rj.access_token,
            token_expires_at: rj.expires_in ? new Date(Date.now() + rj.expires_in * 1000).toISOString() : null,
          }).eq('id', conn.id);
        }
      }

      try {
        const data = await fetchInstagramData(accessToken);
        await db.from('social_connections')
          .update({ ...data, needs_reconnect: false, last_synced_at: new Date().toISOString() })
          .eq('id', conn.id);
        await writeSnapshot(db, userId, data);
        return json({ success: true, ...data });
      } catch (_) {
        await db.from('social_connections').update({ needs_reconnect: true }).eq('id', conn.id);
        return json({ error: 'needs_reconnect' }, 409);
      }
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
