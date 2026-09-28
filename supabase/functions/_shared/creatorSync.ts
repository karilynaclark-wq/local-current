// Shared helper: when a platform account is verified via OAuth, copy the real
// handle + follower tier onto the creator's row so eligibility checks and the
// public profile use verified data instead of what was typed at sign-up.

// deno-lint-ignore no-explicit-any
type Db = any;

// Must match FOLLOWER_RANGES / FOLLOWER_RANK labels used in the app.
export function rangeFromCount(n: number): string {
  if (n < 1000) return 'Under 1K';
  if (n < 5000) return '1K–5K';
  if (n < 10000) return '5K–10K';
  if (n < 50000) return '10K–50K';
  if (n < 100000) return '50K–100K';
  return '100K+';
}

export async function syncCreatorFromVerified(
  db: Db,
  profileId: string,
  platform: 'tiktok' | 'instagram',
  username: string | null,
  followerCount: number,
): Promise<void> {
  const { data: creator } = await db
    .from('creators')
    .select('id, main_platform, secondary_platform')
    .eq('profile_id', profileId)
    .maybeSingle();
  // No creator row yet (e.g. connecting mid-onboarding): onboarding saves the
  // auto-filled values itself when it submits.
  if (!creator) return;

  const range = rangeFromCount(followerCount);
  const updates: Record<string, unknown> = {};
  if (username) updates[`${platform}_handle`] = username.replace(/^@/, '');

  const main = creator.main_platform?.toLowerCase() ?? null;
  const secondary = creator.secondary_platform?.toLowerCase() ?? null;

  if (!main || main === platform) {
    updates.main_platform = platform;
    updates.follower_range = range;
    updates.pending_follower_range = null; // verified data supersedes manual edits awaiting review
  } else if (!secondary || secondary === platform) {
    updates.secondary_platform = platform;
    updates.secondary_follower_range = range;
    updates.pending_secondary_follower_range = null;
  }

  await db.from('creators').update(updates).eq('id', creator.id);
  // Separate write so a missing column (migration not yet run) can't block
  // the handle/tier update above.
  await db.from('creators').update({ [`${platform}_verified`]: true }).eq('id', creator.id);
}

export async function clearCreatorVerified(db: Db, profileId: string, platform: 'tiktok' | 'instagram') {
  await db.from('creators').update({ [`${platform}_verified`]: false }).eq('profile_id', profileId);
}
