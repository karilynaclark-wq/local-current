// Cron Edge Function: notify-post-deadline
// Run hourly.
// - At 12h after check-in: remind creator they have 36 hours left to post
// - At 48h+ after check-in with no post: mark overdue, push a final warning

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const now = Date.now();
  const h12ago = new Date(now - 12 * 60 * 60 * 1000).toISOString();
  const h13ago = new Date(now - 13 * 60 * 60 * 1000).toISOString(); // 1h window for 12h reminder
  const h48ago = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  // Find all redemptions that have been checked in (or completed via voucher),
  // regardless of status — we need to catch creators who redeemed but never posted.
  const { data: checkedIn } = await supabase
    .from('redemptions')
    .select(`
      id,
      creator_id,
      status,
      checked_in_at,
      redeemed_at,
      post_reminder_sent,
      post_overdue_notified,
      circuit:circuits(title, business:businesses(instagram_handle, tiktok_handle)),
      creator:creators(profile_id)
    `)
    .in('status', ['checked_in', 'completed'])
    .not('checked_in_at', 'is', null);

  if (!checkedIn?.length) {
    return new Response(JSON.stringify({ reminders: 0, overdues: 0 }), { status: 200 });
  }

  let reminders = 0;
  let overdues = 0;

  for (const r of checkedIn) {
    const checkedInAt = (r as any).checked_in_at;
    const profileId = (r as any).creator?.profile_id;
    const title = (r as any).circuit?.title ?? 'your current';
    const businessHandle = (r as any).circuit?.business?.instagram_handle || (r as any).circuit?.business?.tiktok_handle || null;
    const tagReminder = businessHandle ? ` Don't forget to tag ${businessHandle.startsWith('@') ? businessHandle : '@' + businessHandle}!` : '';
    const postReminderSent = (r as any).post_reminder_sent;
    const postOverdueNotified = (r as any).post_overdue_notified;

    if (!profileId || !checkedInAt) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', profileId)
      .single();

    const token = profile?.push_token;

    // Check if any posts exist for this redemption
    const { count: postCount } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('redemption_id', r.id);

    if ((postCount ?? 0) > 0) continue; // Already posted, skip

    // 12h reminder: checked in between 12–13h ago, reminder not yet sent
    if (
      !postReminderSent &&
      checkedInAt <= h12ago &&
      checkedInAt > h13ago
    ) {
      if (token) {
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{
            to: token,
            title: "Don't forget to post! ⏰",
            body: `You have 36 hours to post your content for "${title}". Missing the deadline puts your account at risk.${tagReminder}`,
            sound: 'default',
          }]),
        });
        reminders++;
      }
      await supabase
        .from('redemptions')
        .update({ post_reminder_sent: new Date().toISOString() })
        .eq('id', r.id);
    }

    // 48h overdue: checked in 48h+ ago, no post, not yet notified as overdue
    if (!postOverdueNotified && checkedInAt <= h48ago) {
      if (token) {
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{
            to: token,
            title: 'Post deadline missed ⚠️',
            body: `Your 48-hour window to post for "${title}" has passed. Your account status is now under review.`,
            sound: 'default',
          }]),
        });
        overdues++;
      }

      // Increment missed_post_count on the creator record
      const creatorId = (r as any).creator_id;
      if (creatorId) {
        const { data: creator } = await supabase
          .from('creators')
          .select('missed_post_count')
          .eq('id', creatorId)
          .single();
        if (creator != null) {
          await supabase
            .from('creators')
            .update({ missed_post_count: (creator.missed_post_count ?? 0) + 1 })
            .eq('id', creatorId);
        }
      }

      await supabase
        .from('redemptions')
        .update({ post_overdue_notified: true })
        .eq('id', r.id);
    }
  }

  return new Response(JSON.stringify({ reminders, overdues }), { status: 200 });
});
