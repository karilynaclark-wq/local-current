// Supabase Edge Function: send-push
// Accepts { tokens: string[], title: string, body: string, data?: object }
// and fires them via the Expo Push API.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { tokens, title, body, data } = await req.json();

    if (!tokens?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Filter to valid Expo push tokens only
    const valid = (tokens as string[]).filter(
      t => t && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
    );

    if (!valid.length) {
      return new Response(JSON.stringify({ sent: 0, skipped: tokens.length }), { status: 200 });
    }

    const messages = valid.map(to => ({
      to,
      title,
      body,
      data: data ?? {},
      sound: 'default',
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
    return new Response(JSON.stringify({ sent: valid.length, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
