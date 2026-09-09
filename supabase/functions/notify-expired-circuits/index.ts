// Cron Edge Function: notify-expired-circuits
// Run hourly. Finds circuits past their expiry_at with 0 claims,
// marks them inactive, and pushes the business owner.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Find all circuits that have expired, are still active, and haven't been notified yet
  const { data: expiredCircuits } = await supabase
    .from('circuits')
    .select('id, title, business_id, business:businesses(profile_id)')
    .eq('is_active', true)
    .eq('expired_notified', false)
    .lt('expires_at', new Date().toISOString());

  if (!expiredCircuits?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let notified = 0;

  for (const circuit of expiredCircuits) {
    // Check if anyone claimed it
    const { count } = await supabase
      .from('redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('circuit_id', circuit.id);

    // Mark inactive and notified regardless
    await supabase
      .from('circuits')
      .update({ is_active: false, expired_notified: true })
      .eq('id', circuit.id);

    // Only push if 0 claims
    if ((count ?? 0) === 0) {
      const profileId = (circuit.business as any)?.profile_id;
      if (profileId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('push_token')
          .eq('id', profileId)
          .single();

        if (profile?.push_token) {
          await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{
              to: profile.push_token,
              title: 'Your current expired with no claims',
              body: `"${circuit.title}" wasn't claimed by anyone. Tap to post a new current.`,
              sound: 'default',
            }]),
          });
          notified++;
        }
      }
    }
  }

  return new Response(JSON.stringify({ processed: expiredCircuits.length, notified }), { status: 200 });
});
