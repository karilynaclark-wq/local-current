// Shared helper: Instagram follower location (requires the
// instagram_business_manage_insights permission; Meta only returns
// demographics for accounts with 100+ followers). Best effort: returns null
// when unavailable, so connecting/syncing never fails because of it.

// deno-lint-ignore no-explicit-any
type Db = any;

const IG_GRAPH = 'https://graph.instagram.com';

export interface Audience {
  top_cities: { name: string; share: number }[];   // share of all followers, 0–1
  top_countries: { code: string; share: number }[];
  chicago_share: number;   // followers in Chicago itself
  illinois_share: number;  // followers in any Illinois city in the top list (Chicago area proxy)
  fetched_at: string;
}

async function breakdown(accessToken: string, by: 'city' | 'country'): Promise<{ key: string; value: number }[]> {
  const url = `${IG_GRAPH}/me/insights?metric=follower_demographics&period=lifetime&metric_type=total_value` +
    `&breakdown=${by}&access_token=${encodeURIComponent(accessToken)}`;
  const j = await (await fetch(url)).json();
  const results = j?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return results.map((r: any) => ({ key: String(r.dimension_values?.[0] ?? ''), value: Number(r.value) || 0 }));
}

export async function fetchInstagramAudience(accessToken: string): Promise<Audience | null> {
  try {
    const [cities, countries] = await Promise.all([breakdown(accessToken, 'city'), breakdown(accessToken, 'country')]);
    // Country breakdown covers every follower; the city list is only the top ~45.
    const total = countries.reduce((s, c) => s + c.value, 0);
    if (!total || !cities.length) return null;
    const share = (n: number) => Math.round((n / total) * 1000) / 1000;
    const sumWhere = (f: (k: string) => boolean) => cities.filter((c) => f(c.key)).reduce((s, c) => s + c.value, 0);
    return {
      top_cities: cities.sort((a, b) => b.value - a.value).slice(0, 10).map((c) => ({ name: c.key, share: share(c.value) })),
      top_countries: countries.sort((a, b) => b.value - a.value).slice(0, 5).map((c) => ({ code: c.key, share: share(c.value) })),
      chicago_share: share(sumWhere((k) => /^chicago\b/i.test(k))),
      illinois_share: share(sumWhere((k) => /,\s*illinois$/i.test(k))),
      fetched_at: new Date().toISOString(),
    };
  } catch (_) {
    return null;
  }
}

/** Store on the connection; a separate write so a missing column can't break connect/sync. */
export async function saveInstagramAudience(db: Db, profileId: string, accessToken: string): Promise<void> {
  const audience = await fetchInstagramAudience(accessToken);
  if (!audience) return;
  await db.from('social_connections')
    .update({ audience })
    .eq('profile_id', profileId)
    .eq('platform', 'instagram');
}
