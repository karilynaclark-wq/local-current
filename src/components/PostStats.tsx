// Stats for one TikTok / Instagram post: Views + Engagements. Tapping
// Engagements reveals what it adds up (it differs by platform).

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, F, R } from '../theme';
import { Icon } from './Icon';

export interface PostStatsData {
  platform: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
}

/** Parts that make up "engagements" on each platform. */
function engagementParts(p: PostStatsData): { label: string; val: number }[] {
  const base = [
    { label: 'likes', val: p.likes ?? 0 },
    { label: 'comments', val: p.comments ?? 0 },
  ];
  return p.platform === 'instagram'
    ? [...base, { label: 'saves', val: p.saves ?? 0 }, { label: 'shares', val: p.shares ?? 0 }]
    : [...base, { label: 'shares', val: p.shares ?? 0 }];
}

export function hasPostStats(p: PostStatsData): boolean {
  return [p.views, p.likes, p.comments, p.shares, p.saves].some(v => v != null);
}

export default function PostStats({ post }: { post: PostStatsData }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const parts = engagementParts(post);
  const engagements = parts.reduce((sum, x) => sum + x.val, 0);

  return (
    <View>
      <View style={styles.grid}>
        <View style={styles.box}>
          <Text style={styles.num}>{post.views != null ? post.views.toLocaleString() : '—'}</Text>
          <Text style={styles.label}>Views</Text>
        </View>
        <TouchableOpacity style={styles.box} onPress={() => setShowBreakdown(v => !v)} activeOpacity={0.7}>
          <Text style={styles.num}>{engagements.toLocaleString()}</Text>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Engagements</Text>
            <Icon name="chevron-down" size={10} color={C.muted2} />
          </View>
        </TouchableOpacity>
      </View>
      {showBreakdown && (
        <Text style={styles.breakdown}>
          {parts.map(x => `${x.val.toLocaleString()} ${x.label}`).join(' + ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, backgroundColor: C.card, borderRadius: R.sm, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  num: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.accent },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  label: { fontFamily: F.mono, fontSize: 10, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.5 },
  breakdown: { fontFamily: F.body, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 10 },
} as any);
