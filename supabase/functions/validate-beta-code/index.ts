import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { code } = await req.json();
    const valid = typeof code === 'string' &&
      code.trim().toLowerCase() === Deno.env.get('BETA_CODE')?.toLowerCase();

    return new Response(JSON.stringify({ valid }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
