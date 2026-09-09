// Edge Function: notify-new-circuit
// Finds eligible approved creators for a circuit and sends them a push notification.
// Push tokens never leave the server — called by business clients after publishing.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { circuitTitle, businessName, eligibilityMinFollowers, eligibilityNiches } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch eligible approved creators with push tokens — server-side only
    const { data: creators } = await supabase
      .from('creators')
      .select('follower_range, niche, profile:profiles(push_token)')
      .eq('status', 'approved');

    if (!creators?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const allowedRanges: string[] = eligibilityMinFollowers
      ? eligibilityMinFollowers.split(',').map((r: string) => r.trim())
      : [];
    const requiredNiches: string[] = eligibilityNiches ?? [];

    const tokens = (creators as any[])
      .filter((c) => {
        if (!c.profile?.push_token) return false;
        if (allowedRanges.length > 0 && !allowedRanges.includes(c.follower_range)) return false;
        if (requiredNiches.length > 0) {
          const cNiches: string[] = c.niche ? c.niche.split(',').map((n: string) => n.trim()) : [];
          if (!requiredNiches.some((n) => cNiches.includes(n))) return false;
        }
        return true;
      })
      .map((c) => c.profile.push_token)
      .filter((t: string) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

    if (!tokens.length) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const messages = tokens.map((to: string) => ({
      to,
      title: `New current in your area 📍`,
      body: `${businessName} just posted: "${circuitTitle}"`,
      sound: 'default',
    }));

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    return new Response(JSON.stringify({ sent: tokens.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
