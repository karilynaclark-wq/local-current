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
export async function registerForPushNotifications(prompt = true): Promise<string | null> {
  if (!Device.isDevice) {
    // Push tokens only work on real devices
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    if (!prompt) return null; // only refresh the token when permission was already given
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
 * Push a notification to another user. The server looks up their token and
 * checks you're allowed to reach them (see send-push).
 */
export async function notifyUser(
  profileId: string | string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: { to: profileId, title, body, data: data ?? {} } });
  } catch {
    // Push delivery failed silently — non-critical
  }
}
