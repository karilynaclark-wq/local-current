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
    const { circuitId } = await req.json();
    if (!circuitId) {
      return new Response(JSON.stringify({ error: 'circuitId required' }), { status: 400 });
    }

    // Identify the caller from their JWT.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Only the business that owns the current can announce it, and the text
    // comes from the database rather than the request.
    const { data: circuit } = await supabase
      .from('circuits')
      .select('title, eligibility_min_followers, eligibility_niches, business:businesses(business_name, profile_id)')
      .eq('id', circuitId)
      .single();
    const biz = (circuit as any)?.business;
    if (!circuit || biz?.profile_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not allowed' }), { status: 403 });
    }
    const circuitTitle = circuit.title;
    const businessName = biz.business_name || 'A local business';
    const eligibilityMinFollowers: string = circuit.eligibility_min_followers ?? '';
    const eligibilityNiches: string[] = Array.isArray(circuit.eligibility_niches) ? circuit.eligibility_niches : [];

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
