import { Circuit } from '../types';

// ── Numeric minimum-following model (circuits.min_followers) ────────────────
/** Minimum-following choices offered to businesses, largest last. */
export const MIN_FOLLOWER_OPTIONS = [
  { label: 'Under 1K', value: 0 },
  { label: '5K+', value: 5_000 },
  { label: '10K+', value: 10_000 },
  { label: '25K+', value: 25_000 },
  { label: '50K+', value: 50_000 },
  { label: '100K+', value: 100_000 },
  { label: '150K+', value: 150_000 },
];

export function minFollowersLabel(n: number): string {
  return MIN_FOLLOWER_OPTIONS.find(o => o.value === n)?.label ?? `${Math.round(n / 1000)}K+`;
}

/** Lower bound of a self-reported tier, used when there's no verified count. */
const TIER_FLOOR: Record<string, number> = {
  'Under 1K': 0, '1K–5K': 1_000, '5K–10K': 5_000,
  '10K–50K': 10_000, '50K–100K': 50_000, '100K+': 100_000,
};

export type PlatformCountMap = { tiktok?: number; instagram?: number };

/**
 * Follower count per platform: the verified (OAuth) count when connected,
 * otherwise the floor of the creator's self-reported tier.
 */
export function creatorFollowerCounts(
  tiers: PlatformFollowerMap,
  connections: { platform: string; connection_type: string; follower_count: number }[] = [],
): PlatformCountMap {
  const out: PlatformCountMap = {};
  for (const p of ['tiktok', 'instagram'] as const) {
    const verified = connections.find(c => c.platform === p && c.connection_type === 'oauth');
    if (verified) out[p] = verified.follower_count;
    else if (tiers[p] && tiers[p]! in TIER_FLOOR) out[p] = TIER_FLOOR[tiers[p]!];
  }
  return out;
}

/**
 * Threshold currently open for a min_followers current: larger accounts get
 * first access, stepping down one option every 24h until the minimum.
 */
function currentThreshold(min: number, createdAt: string | undefined): number {
  const stages = MIN_FOLLOWER_OPTIONS.map(o => o.value).filter(v => v >= min).sort((a, b) => b - a);
  if (stages.length === 0) return min;
  const created = createdAt ? new Date(createdAt).getTime() : Date.now();
  const days = Math.floor((Date.now() - created) / 86_400_000);
  return stages[Math.min(days, stages.length - 1)];
}

function numericStatus(circuit: Circuit, counts: PlatformCountMap): 'eligible' | 'soon' | 'no' {
  const min = circuit.min_followers as number;
  const platforms = circuit.required_platform === 'tiktok' ? ['tiktok']
    : circuit.required_platform === 'instagram' ? ['instagram']
    : ['tiktok', 'instagram'];
  const best = Math.max(-1, ...platforms.map(p => counts[p as 'tiktok' | 'instagram'] ?? -1));
  if (best < 0 || best < min) return 'no';
  return best >= currentThreshold(min, circuit.created_at) ? 'eligible' : 'soon';
}

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
  creatorFollowers?: PlatformFollowerMap,
  creatorCounts?: PlatformCountMap,
): 'eligible' | 'soon' | 'no' {
  const requiredNiches: string[] = circuit.eligibility_niches ?? [];
  const nicheOk = requiredNiches.length === 0 || niches.some(n => requiredNiches.includes(n));
  if (!nicheOk) return 'no';

  if (circuit.min_followers != null) return numericStatus(circuit, creatorCounts ?? {});

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
  creatorFollowers?: PlatformFollowerMap,
  creatorCounts?: PlatformCountMap,
): boolean {
  const requiredNiches: string[] = circuit.eligibility_niches ?? [];
  const nicheOk = requiredNiches.length === 0 || niches.some(n => requiredNiches.includes(n));

  if (circuit.min_followers != null) {
    return nicheOk && numericStatus(circuit, creatorCounts ?? {}) === 'eligible';
  }

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
