import { Circuit } from '../types';

const FOLLOWER_TIER_ORDER = [
  '100K+',
  '50K–100K',
  '10K–50K',
  '5K–10K',
  '1K–5K',
  'Under 1K',
];

/**
 * Returns the subset of the given follower ranges that are currently unlocked
 * based on time since creation. The largest tier is available immediately;
 * each subsequent tier unlocks every 24 hours.
 */
function unlockedFrom(ranges: string[], createdAt: string | undefined): string[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort(
    (a, b) => FOLLOWER_TIER_ORDER.indexOf(a) - FOLLOWER_TIER_ORDER.indexOf(b)
  );
  const created = createdAt ? new Date(createdAt).getTime() : Date.now();
  const hoursElapsed = (Date.now() - created) / (1000 * 60 * 60);
  const tiersUnlocked = Math.floor(hoursElapsed / 24) + 1;
  return sorted.slice(0, tiersUnlocked);
}

/**
 * Per-platform eligibility status for a creator:
 *  - 'eligible': a required platform's currently-unlocked tier includes the creator's range
 *  - 'soon': the creator's range is selected but that tier hasn't unlocked yet
 *  - 'no': the creator's range isn't part of this current (or niche mismatch)
 */
export function eligibilityStatus(
  circuit: Circuit,
  followerRange: string,
  niches: string[],
  creatorFollowers?: PlatformFollowerMap
): 'eligible' | 'soon' | 'no' {
  const requiredNiches: string[] = circuit.eligibility_niches ?? [];
  const nicheOk = requiredNiches.length === 0 || niches.some(n => requiredNiches.includes(n));
  if (!nicheOk) return 'no';

  const pf = circuit.platform_followers;
  const selectedPlatforms = pf
    ? (['tiktok', 'instagram'] as const).filter(p => (pf[p]?.length ?? 0) > 0)
    : [];

  if (selectedPlatforms.length > 0) {
    const map = creatorFollowers ?? {};
    const matchable = selectedPlatforms.filter(p => !!map[p]);
    if (matchable.length === 0) return 'no';
    const eligibleNow = matchable.some(p => unlockedFrom(pf![p]!, circuit.created_at).includes(map[p]!));
    if (eligibleNow) return 'eligible';
    const inFullRange = matchable.some(p => (pf![p] ?? []).includes(map[p]!));
    return inFullRange ? 'soon' : 'no';
  }

  const allRanges = circuit.eligibility_min_followers
    ? circuit.eligibility_min_followers.split(',').map(r => r.trim())
    : [];
  if (allRanges.length === 0) return 'eligible';
  if (currentlyEligibleRanges(circuit).includes(followerRange)) return 'eligible';
  return allRanges.includes(followerRange) ? 'soon' : 'no';
}

/**
 * Combined (all-platform) unlocked ranges from the legacy
 * eligibility_min_followers field. Used for display and older circuits.
 */
export function currentlyEligibleRanges(circuit: Circuit): string[] {
  const allAllowed = circuit.eligibility_min_followers
    ? circuit.eligibility_min_followers.split(',').map(r => r.trim())
    : [];
  return unlockedFrom(allAllowed, circuit.created_at);
}

export type PlatformFollowerMap = { tiktok?: string; instagram?: string };

/**
 * Builds the creator's follower range per platform from their profile.
 * Creators store a main platform + range and an optional secondary
 * platform + range, so someone on both TikTok and Instagram has a
 * distinct follower range for each.
 */
export function creatorFollowersByPlatform(creator: {
  main_platform?: string | null;
  follower_range?: string | null;
  secondary_platform?: string | null;
  secondary_follower_range?: string | null;
}): PlatformFollowerMap {
  const map: PlatformFollowerMap = {};
  if (creator.main_platform && creator.follower_range) {
    map[creator.main_platform as 'tiktok' | 'instagram'] = creator.follower_range;
  }
  if (creator.secondary_platform && creator.secondary_follower_range) {
    map[creator.secondary_platform as 'tiktok' | 'instagram'] = creator.secondary_follower_range;
  }
  return map;
}

export function isEligibleForCircuit(
  circuit: Circuit,
  followerRange: string,
  niches: string[],
  creatorFollowers?: PlatformFollowerMap
): boolean {
  const requiredNiches: string[] = circuit.eligibility_niches ?? [];
  const nicheOk = requiredNiches.length === 0 || niches.some(n => requiredNiches.includes(n));

  const pf = circuit.platform_followers;
  const selectedPlatforms = pf
    ? (['tiktok', 'instagram'] as const).filter(p => (pf[p]?.length ?? 0) > 0)
    : [];

  // Platform-aware matching: match the creator's follower range for a
  // required platform against that platform's unlocked ranges.
  if (selectedPlatforms.length > 0) {
    const map = creatorFollowers ?? {};
    // Platforms the circuit requires AND the creator is actually on
    const matchable = selectedPlatforms.filter(p => !!map[p]);
    if (matchable.length === 0) return false;
    const followerOk = matchable.some(p =>
      unlockedFrom(pf![p]!, circuit.created_at).includes(map[p]!)
    );
    return followerOk && nicheOk;
  }

  // Fallback: combined ranges (older circuits) against the creator's main range
  const eligibleRanges = currentlyEligibleRanges(circuit);
  const followerOk = eligibleRanges.length === 0 || eligibleRanges.includes(followerRange);
  return followerOk && nicheOk;
}
