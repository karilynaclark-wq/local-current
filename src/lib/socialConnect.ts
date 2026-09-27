// Social account connections (TikTok now; Instagram to follow).
//
// The OAuth flow is brokered by the `tiktok-auth` edge function so the client
// secret never lives in the app. Here we: ask the function for a login URL,
// open it in a secure browser session, and let the function deep-link us back.

import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

export type Platform = 'tiktok' | 'instagram';

export interface SocialConnection {
  platform: Platform;
  username: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  bio: string | null;
  is_verified: boolean;
  profile_deep_link: string | null;
  follower_count: number;
  following_count: number;
  likes_count: number;
  media_count: number;
  recent_posts: any[] | null;
  connection_type: 'oauth' | 'manual';
  needs_reconnect: boolean;
  last_synced_at: string | null;
  connected_at: string;
}

// Columns safe to read on the client — never select the *_token columns.
const SAFE_COLUMNS =
  'platform,username,avatar_url,profile_url,bio,is_verified,profile_deep_link,follower_count,following_count,likes_count,media_count,recent_posts,connection_type,needs_reconnect,last_synced_at,connected_at';

const FUNCTIONS_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;
const TIKTOK_REDIRECT = 'localcurrent://social/tiktok';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Read the current user's connections (safe columns only). */
export async function getConnections(): Promise<SocialConnection[]> {
  const { data, error } = await supabase
    .from('social_connections')
    .select(SAFE_COLUMNS);
  if (error) throw error;
  return (data ?? []) as SocialConnection[];
}

/**
 * Launch the TikTok connect flow. Returns 'success' | 'cancel' | 'error'.
 * On success the edge function has already saved the connection — callers
 * should re-fetch getConnections() afterward.
 */
export async function connectTikTok(): Promise<'success' | 'cancel' | 'error'> {
  const headers = await authHeader();
  if (!headers.Authorization) return 'error';

  // 1) Ask the broker for a TikTok authorize URL tied to this user.
  const res = await fetch(`${FUNCTIONS_BASE}/tiktok-auth?action=start`, { headers });
  if (!res.ok) return 'error';
  const { authorizeUrl } = await res.json();
  if (!authorizeUrl) return 'error';

  // 2) Open it; the browser closes when TikTok redirects to our deep link.
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, TIKTOK_REDIRECT);
  if (result.type !== 'success') return 'cancel';

  // 3) The deep-link URL carries the outcome from the edge function.
  return result.url.includes('status=success') ? 'success' : 'error';
}

/** Re-pull follower count + posts for the connected TikTok account. */
export async function syncTikTok(): Promise<void> {
  const headers = await authHeader();
  await fetch(`${FUNCTIONS_BASE}/tiktok-auth?action=sync`, { method: 'POST', headers });
}

/** Disconnect the TikTok account. */
export async function disconnectTikTok(): Promise<void> {
  const headers = await authHeader();
  await fetch(`${FUNCTIONS_BASE}/tiktok-auth?action=disconnect`, { method: 'POST', headers });
}

/**
 * Manual fallback (e.g. Instagram personal accounts that can't use the API).
 * Stores a self-reported handle + follower count, flagged as unverified.
 */
export async function saveManualConnection(
  platform: Platform,
  username: string,
  followerCount: number,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase.from('social_connections').upsert({
    profile_id: user.id,
    platform,
    connection_type: 'manual',
    username,
    follower_count: followerCount,
    profile_url:
      platform === 'tiktok'
        ? `https://www.tiktok.com/@${username.replace(/^@/, '')}`
        : `https://instagram.com/${username.replace(/^@/, '')}`,
    connected_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,platform' });
  if (error) throw error;
}
