// Creator profile stats: verified follower pills plus a "local" pill from the
// AI summary of recent posts (creators.ai_summary, written by summarize-creator).

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal } from 'react-native';
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
  const [showWhy, setShowWhy] = useState(false);

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
        <TouchableOpacity style={styles.local} disabled={!isOwn} onPress={() => setShowWhy(true)} activeOpacity={0.7}>
          <Icon name="pin" size={13} color={C.muted} />
          {share! >= LOCAL_THRESHOLD ? (
            <Text style={styles.localText}>
              <Text style={styles.localLead}>{isOwn ? "You're local: " : "They're local: "}</Text>
              {pct}% of recent posts are about Chicago
            </Text>
          ) : (
            <Text style={styles.localText}>
              <Text style={styles.localLead}>{isOwn ? "Your posts aren't local: " : "Their posts aren't local: "}</Text>
              {100 - pct}% of recent posts are not about Chicago
            </Text>
          )}
          {isOwn && <Icon name="chevron-right" size={13} color={C.muted2} />}
        </TouchableOpacity>
      )}

      <Modal visible={showWhy} transparent animationType="fade" onRequestClose={() => setShowWhy(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowWhy(false)}>
          <View style={styles.box} onStartShouldSetResponder={() => true}>
            <Text style={styles.boxTitle}>Why this matters</Text>
            <Text style={styles.boxBody}>
              This helps businesses know your content will be shown to others in Chicago.
            </Text>
            <Text style={styles.boxFine}>
              We look at your recent posts and count how many are about Chicago.
            </Text>
            <TouchableOpacity style={styles.boxBtn} onPress={() => setShowWhy(false)} activeOpacity={0.85}>
              <Text style={styles.boxBtnText}>Got it</Text>
            </TouchableOpacity>
            <Text style={styles.boxFine}>Think this stat is inaccurate?</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(`mailto:hello@localcurrentapp.com?subject=${encodeURIComponent('My local stat looks wrong')}&body=${encodeURIComponent(`My profile says ${pct}% of my recent posts are about Chicago, but I think that's inaccurate because: `)}`)}
            >
              <Text style={styles.boxLink}>Let us know</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'center', padding: 28 },
  box: { backgroundColor: C.card, borderRadius: R.lg, padding: 24, gap: 10 },
  boxTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 20, color: C.ink },
  boxBody: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.inkSoft },
  boxFine: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.muted, textAlign: 'center' },
  boxBtn: { backgroundColor: C.accent, borderRadius: R.btn, padding: 14, alignItems: 'center', marginTop: 6, marginBottom: 4 },
  boxBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: '#fff' },
  boxLink: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent, textAlign: 'center', textDecorationLine: 'underline', marginTop: -6 },
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
