// Ask summarize-creator to refresh a creator's AI summary after their posts
// sync. Runs in the background when the runtime supports it so connect/sync
// responses aren't held up; failures are ignored (the next sync retries).

export function refreshCreatorSummary(profileId: string): void {
  const run = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/summarize-creator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '' },
    body: JSON.stringify({ profileId }),
  }).catch(() => {});
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(run);
}
