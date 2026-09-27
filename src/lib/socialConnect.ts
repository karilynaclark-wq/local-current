// Social account connections (TikTok, Instagram).
//
// Each OAuth flow is brokered by a `<platform>-auth` edge function so client
// secrets never live in the app. Here we: ask the function for a login URL,
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
 * Outcome of a connect attempt.
 * - 'account_type': Instagram rejected a personal (non-professional) account
 * - 'not_configured': the platform's app credentials aren't set up yet
 */
export type ConnectResult = 'success' | 'cancel' | 'error' | 'account_type' | 'not_configured';

/**
 * Launch a platform's connect flow via its edge-function broker. On success
 * the function has already saved the connection — callers should re-fetch
 * getConnections() afterward.
 */
async function connectPlatform(platform: Platform): Promise<ConnectResult> {
  const headers = await authHeader();
  if (!headers.Authorization) return 'error';

  // 1) Ask the broker for an authorize URL tied to this user.
  const res = await fetch(`${FUNCTIONS_BASE}/${platform}-auth?action=start`, { headers });
  if (res.status === 503) return 'not_configured';
  if (!res.ok) return 'error';
  const { authorizeUrl } = await res.json();
  if (!authorizeUrl) return 'error';

  // 2) Open it; the browser closes when the broker redirects to our deep link.
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, `localcurrent://social/${platform}`);
  if (result.type !== 'success') return 'cancel';

  // 3) The deep-link URL carries the outcome from the edge function.
  if (result.url.includes('status=success')) return 'success';
  if (result.url.includes('status=cancel')) return 'cancel';
  if (result.url.includes('reason=account_type')) return 'account_type';
  return 'error';
}

async function postAction(platform: Platform, action: 'sync' | 'disconnect'): Promise<void> {
  const headers = await authHeader();
  await fetch(`${FUNCTIONS_BASE}/${platform}-auth?action=${action}`, { method: 'POST', headers });
}

export const connectTikTok = () => connectPlatform('tiktok');
export const syncTikTok = () => postAction('tiktok', 'sync');
export const disconnectTikTok = () => postAction('tiktok', 'disconnect');

export const connectInstagram = () => connectPlatform('instagram');
export const syncInstagram = () => postAction('instagram', 'sync');
export const disconnectInstagram = () => postAction('instagram', 'disconnect');

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
