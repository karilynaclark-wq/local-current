export type UserRole = 'creator' | 'business';

export type CreatorStatus = 'pending' | 'approved' | 'rejected';

export type RedemptionType = 'code' | 'voucher';

export type SubscriptionTier = 'starter' | 'growth' | 'pro';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  created_at: string;
}

export interface Creator {
  id: string;
  profile_id: string;
  status: CreatorStatus;
  bio: string;
  instagram_handle: string;
  tiktok_handle: string;
  follower_count: number;
  niche: string;
  city: string;
  created_at: string;
}

export interface Business {
  id: string;
  profile_id: string;
  business_name: string;
  description: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  subscription_tier: SubscriptionTier;
  created_at: string;
}

export interface Circuit {
  id: string;
  business_id: string;
  title: string;
  description: string;
  redemption_type: RedemptionType;
  eligibility_min_followers: string;
  eligibility_niches: string[];
  event_link: string | null;
  creator_notes: string | null;
  platform_followers: { tiktok?: string[]; instagram?: string[] } | null;
  max_redemptions: number | null;
  guest_count: number | null;
  starts_at: string | null;
  expires_at: string | null;
  voucher_description: string | null;
  is_active: boolean;
  created_at: string;
  business?: Business;
}

export type RedemptionStatus =
  | 'requested' | 'approved' | 'declined' | 'expired' | 'cancelled'
  | 'claimed' | 'checked_in' | 'completed';

/** Statuses that occupy one of a current's spots. */
export const FILLED_STATUSES: RedemptionStatus[] = ['approved', 'checked_in', 'completed', 'claimed'];

/** Number of filled spots in a list of redemptions (e.g. a `redemptions(status)` join). */
export function countFilled(redemptions?: { status?: string | null }[] | null): number {
  return (redemptions ?? []).filter(r => FILLED_STATUSES.includes(r.status as RedemptionStatus)).length;
}

export type RequestChip = 'requested' | 'approved' | 'redeemed' | 'completed' | 'declined' | 'expired' | 'withdrawn';

/** Chip for a creator's own redemption. */
export function requestChipFor(status: string | null | undefined, hasPost = false): RequestChip {
  switch (status) {
    case 'requested': return 'requested';
    case 'declined': return 'declined';
    case 'expired': return 'expired';
    case 'cancelled': return 'withdrawn';
    case 'completed': return hasPost ? 'completed' : 'redeemed';
    default: return 'approved'; // approved, checked_in, legacy claimed
  }
}

export interface Redemption {
  id: string;
  circuit_id: string;
  creator_id: string;
  code: string | null;
  voucher_id: string | null;
  claimed_at: string;
  checked_in_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  status: RedemptionStatus;
  requested_at: string | null;
  responded_at: string | null;
  access_details: string | null;
  circuit?: Circuit;
}

export interface Post {
  id: string;
  redemption_id: string;
  creator_id: string;
  business_id: string;
  video_url: string;
  platform: 'tiktok' | 'instagram' | 'youtube' | 'other';
  views: number | null;
  likes: number | null;
  comments: number | null;
  submitted_at: string;
  circuit?: Circuit;
}
