// Business-side list of creators who claimed tickets to one current, with the
// code each one received. Claims happen instantly via the claim_current RPC.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F, R } from '../theme';
import { Icon, SocialIcon } from './Icon';
import { FILLED_STATUSES, type RedemptionStatus } from '../types';

export interface ClaimRow {
  id: string;
  status: RedemptionStatus;
  requested_at: string | null;
  claimed_at?: string | null;
  access_details: string | null;
  code?: string | null;
  creator: {
    id: string;
    profile_id: string;
    instagram_handle: string | null;
    tiktok_handle: string | null;
    main_platform: string | null;
    follower_range: string | null;
    secondary_follower_range: string | null;
    tiktok_verified?: boolean;
    instagram_verified?: boolean;
    profile?: { full_name: string | null } | null;
  } | null;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Each platform's tier: the main platform uses follower_range, the other secondary. */
function platformLines(c: NonNullable<ClaimRow['creator']>) {
  const igMain = (c.main_platform ?? '').toLowerCase() === 'instagram';
  const lines: { kind: 'tt' | 'ig'; handle: string; range: string; verified: boolean }[] = [];
  if (c.tiktok_handle) {
    lines.push({
      kind: 'tt', handle: c.tiktok_handle.replace(/^@/, ''),
      range: (igMain ? c.secondary_follower_range : c.follower_range) ?? '',
      verified: !!c.tiktok_verified,
    });
  }
  if (c.instagram_handle) {
    lines.push({
      kind: 'ig', handle: c.instagram_handle.replace(/^@/, ''),
      range: (igMain ? c.follower_range : c.secondary_follower_range) ?? '',
      verified: !!c.instagram_verified,
    });
  }
  return lines;
}

export default function ClaimsSection({ circuit, rows, onOpenCreator }: {
  circuit: { max_redemptions: number | null; code_mode?: 'shared' | 'list' | null };
  rows: ClaimRow[];
  onOpenCreator: (creatorId: string) => void;
}) {
  const claimed = rows
    .filter(r => FILLED_STATUSES.includes(r.status))
    .sort((a, b) => (b.claimed_at ?? '').localeCompare(a.claimed_at ?? ''));
  const spots = circuit.max_redemptions;
  const full = spots != null && claimed.length >= spots;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Claimed</Text>
        {spots != null && (
          <Text style={[styles.spots, full && styles.spotsFull]}>
            {claimed.length} of {spots} claimed
          </Text>
        )}
      </View>

      {claimed.length === 0 ? (
        <Text style={styles.empty}>No one has claimed tickets yet. We'll notify you when a creator does.</Text>
      ) : claimed.map(row => {
        const c = row.creator;
        return (
          <View key={row.id} style={styles.card}>
            <TouchableOpacity onPress={() => c && onOpenCreator(c.id)} activeOpacity={0.7}>
              <Text style={styles.name}>{c?.profile?.full_name ?? 'Creator'} ›</Text>
            </TouchableOpacity>
            {c && platformLines(c).map(l => (
              <View key={l.kind} style={styles.platformRow}>
                <SocialIcon kind={l.kind} size={13} color={C.ink} />
                <Text style={styles.platformText}>@{l.handle}{l.range ? `  ·  ${l.range}` : ''}</Text>
                {l.verified && (
                  <View style={styles.verifiedBadge}>
                    <Icon name="check" size={9} color={C.ok} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </View>
            ))}
            <Text style={styles.meta}>
              Claimed {timeAgo(row.claimed_at ?? row.requested_at)}
              {circuit.code_mode === 'list' && row.code ? `  ·  code ${row.code}` : ''}
              {row.status === 'checked_in' || row.status === 'completed' ? '  ·  got tickets' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, marginBottom: 8, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: F.display, fontWeight: '700', fontSize: 18, color: C.ink },
  spots: { fontFamily: F.bodySemi, fontSize: 13, color: C.muted },
  spotsFull: { color: C.ok },
  empty: { fontFamily: F.body, fontSize: 13.5, color: C.muted, lineHeight: 19 },
  card: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 14, gap: 6,
    borderWidth: 1, borderColor: C.line,
  },
  name: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.ink },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  platformText: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.okSoft, borderRadius: R.sm, paddingHorizontal: 5, paddingVertical: 1,
  },
  verifiedText: { fontFamily: F.bodySemi, fontSize: 9.5, color: C.ok },
  meta: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
});