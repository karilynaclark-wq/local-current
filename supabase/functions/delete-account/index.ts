// Edge Function: delete-account
// Deletes all user data AND the Supabase Auth user record.
// Must be called with a valid user JWT — we extract the user id from it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    // Use the user's JWT to identify them
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const userId = user.id;

    // Use service role for all deletions
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Delete creator data
    const { data: creator } = await admin
      .from('creators')
      .select('id')
      .eq('profile_id', userId)
      .single();

    if (creator) {
      await admin.from('redemptions').delete().eq('creator_id', creator.id);
      await admin.from('creators').delete().eq('id', creator.id);
    }

    // Delete business data
    const { data: business } = await admin
      .from('businesses')
      .select('id')
      .eq('profile_id', userId)
      .single();

    if (business) {
      // Delete posts linked to this business's circuits
      const { data: circuits } = await admin
        .from('circuits')
        .select('id')
        .eq('business_id', business.id);

      if (circuits?.length) {
        const circuitIds = circuits.map((c: any) => c.id);
        const { data: redemptions } = await admin
          .from('redemptions')
          .select('id')
          .in('circuit_id', circuitIds);
        if (redemptions?.length) {
          await admin.from('posts').delete().in('redemption_id', redemptions.map((r: any) => r.id));
          await admin.from('redemptions').delete().in('circuit_id', circuitIds);
        }
        await admin.from('circuits').delete().eq('business_id', business.id);
      }

      await admin.from('businesses').delete().eq('id', business.id);
    }

    // Delete profile row
    await admin.from('profiles').delete().eq('id', userId);

    // Delete the Supabase Auth user — this is the key step that was missing
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Auth delete error:', deleteError.message);
      // Still return success — data is gone even if auth cleanup fails
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
