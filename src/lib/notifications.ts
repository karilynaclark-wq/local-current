import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// How notifications look when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permission and save the Expo push token to the user's profile.
 * Call once after the user is authenticated.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push tokens only work on real devices
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Save to Supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', user.id);
    }

    return token;
  } catch (e) {
    // Push token registration failed silently — not a blocking error
    return null;
  }
}

/**
 * Send a push notification via the Supabase Edge Function.
 * `tokens` can be a single token string or an array.
 */
export async function sendPush(
  tokens: string | string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
  const valid = tokenArray.filter(Boolean);
  if (!valid.length) return;

  try {
    await supabase.functions.invoke('send-push', {
      body: { tokens: valid, title, body, data: data ?? {} },
    });
  } catch (e) {
    // Push delivery failed silently — non-critical
  }
}

/**
 * Look up the push token for a given profile_id (user id).
 */
export async function getPushToken(profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', profileId)
    .single();
  return data?.push_token ?? null;
}

/**
 * Look up push tokens for all eligible creators for a circuit.
 * Filters by follower range and niches.
 */
export async function getEligibleCreatorTokens(
  eligibilityMinFollowers: string,
  eligibilityNiches: string[]
): Promise<string[]> {
  const allowedRanges = eligibilityMinFollowers
    ? eligibilityMinFollowers.split(',').map(r => r.trim())
    : [];

  const { data } = await supabase
    .from('creators')
    .select('follower_range, niche, profile:profiles(push_token)')
    .eq('status', 'approved');

  if (!data) return [];

  return (data as any[])
    .filter((c: any) => {
      if (!c.profile?.push_token) return false;
      if (allowedRanges.length > 0 && !allowedRanges.includes(c.follower_range)) return false;
      if (eligibilityNiches.length > 0) {
        const creatorNiches: string[] = c.niche ? c.niche.split(',').map((n: string) => n.trim()) : [];
        if (!eligibilityNiches.some(n => creatorNiches.includes(n))) return false;
      }
      return true;
    })
    .map((c: any) => c.profile.push_token)
    .filter(Boolean);
}
