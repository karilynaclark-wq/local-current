// Creator profile stats: verified follower pills plus a "local" pill from the
// AI summary of recent posts (creators.ai_summary, written by summarize-creator).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { C, F, R } from '../theme';
import { Icon, SocialIcon } from './Icon';

export interface AiSummary {
  local_share: number | null;
  local_basis?: { chicago: number; elsewhere: number; unknown: number };
  neighborhoods: string[];
  topics: string[];
}

export interface FollowerCount {
  platform: 'tiktok' | 'instagram';
  count: number;
  verified: boolean;
  url?: string | null;
}

// Below this many placeable posts, a local share is too noisy to show.
const MIN_PLACED_POSTS = 3;
// At or above this share, lead with "They're local".
const LOCAL_THRESHOLD = 0.5;

/** 6323 → "6.3K", 1448 → "1.4K", 820 → "820". */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

export default function CreatorInsights({ counts, summary, isOwn = false }: {
  counts: FollowerCount[];
  summary?: AiSummary | null;
  isOwn?: boolean;
}) {
  const placed = (summary?.local_basis?.chicago ?? 0) + (summary?.local_basis?.elsewhere ?? 0);
  const share = summary?.local_share;
  const showLocal = share != null && placed >= MIN_PLACED_POSTS;
  const pct = showLocal ? Math.round(share! * 100) : 0;

  return (
    <View style={styles.wrap}>
      {counts.length > 0 && (
        <View style={styles.pills}>
          {counts.map(c => (
            <TouchableOpacity
              key={c.platform}
              style={styles.pill}
              disabled={!c.url}
              onPress={() => c.url && Linking.openURL(c.url)}
              activeOpacity={0.7}
            >
              <SocialIcon kind={c.platform === 'tiktok' ? 'tt' : 'ig'} size={15} color={C.ink} />
              <Text style={styles.pillText}>{compactCount(c.count)}</Text>
              {c.verified && <View style={styles.check}><Icon name="check" size={8} color="#fff" stroke={3} /></View>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showLocal && (
        <View style={styles.local}>
          <Icon name="pin" size={13} color={C.muted} />
          <Text style={styles.localText}>
            {share! >= LOCAL_THRESHOLD && (
              <Text style={styles.localLead}>{isOwn ? "You're local: " : "They're local: "}</Text>
            )}
            {pct}% of recent posts are about Chicago
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderRadius: R.pill, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  pillText: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink },
  check: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#5E9A55', alignItems: 'center', justifyContent: 'center' },
  local: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch',
    backgroundColor: C.line, borderRadius: R.pill, paddingHorizontal: 18, paddingVertical: 10,
  },
  localText: { flex: 1, fontFamily: F.body, fontSize: 13.5, color: C.muted, textAlign: 'center', lineHeight: 19 },
  localLead: { fontFamily: F.bodyBold, color: C.inkSoft },
} as any);
