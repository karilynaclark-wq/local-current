// Cron Edge Function: notify-pending-ratings
// Run hourly. Finds posts submitted 24h+ ago where the business hasn't rated yet,
// and pushes the business owner once.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find redemptions that have posts submitted 24h+ ago, not yet rated by business,
  // and haven't had a rating notification sent yet
  const { data: redemptions } = await supabase
    .from('redemptions')
    .select(`
      id,
      business_rated_at,
      business_rating_notified,
      circuit:circuits(title, business:businesses(profile_id)),
      posts(id, created_at)
    `)
    .is('business_rating', null)
    .is('business_rating_notified', null)
    .eq('status', 'completed');

  if (!redemptions?.length) {
    return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
  }

  let notified = 0;

  for (const redemption of redemptions) {
    const posts = (redemption as any).posts ?? [];
    const latestPost = posts.sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    if (!latestPost || latestPost.created_at > cutoff) continue;

    const profileId = (redemption as any).circuit?.business?.profile_id;
    if (!profileId) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', profileId)
      .single();

    if (profile?.push_token) {
      const title = (redemption as any).circuit?.title ?? 'a current';
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          to: profile.push_token,
          title: "How's the content performing? ⚡",
          body: `A creator posted for "${title}" 24 hours ago — check it out and rate them.`,
          sound: 'default',
        }]),
      });

      // Mark as notified so we don't send again
      await supabase
        .from('redemptions')
        .update({ business_rating_notified: new Date().toISOString() })
        .eq('id', redemption.id);

      notified++;
    }
  }

  return new Response(JSON.stringify({ notified }), { status: 200 });
});
