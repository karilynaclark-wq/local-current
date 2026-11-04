// "What they post about" card: the AI summary of a creator's recent posts
// (creators.ai_summary, written by the summarize-creator function).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, F, R } from '../theme';
import { Icon } from './Icon';

export interface AiSummary {
  local_share: number | null;
  local_basis?: { chicago: number; elsewhere: number; unknown: number };
  neighborhoods: string[];
  topics: string[];
}

// Below this many placeable posts, a local share is too noisy to show.
const MIN_PLACED_POSTS = 3;

export default function CreatorInsights({ summary }: { summary?: AiSummary | null }) {
  if (!summary) return null;
  const placed = (summary.local_basis?.chicago ?? 0) + (summary.local_basis?.elsewhere ?? 0);
  const showLocal = summary.local_share != null && placed >= MIN_PLACED_POSTS;
  const neighborhoods = (summary.neighborhoods ?? []).slice(0, 4);
  const topics = (summary.topics ?? []).slice(0, 5);
  if (!showLocal && !neighborhoods.length && !topics.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>WHAT THEY POST ABOUT</Text>

      {showLocal && (
        <View style={styles.localRow}>
          <Text style={styles.localNum}>{Math.round(summary.local_share! * 100)}%</Text>
          <Text style={styles.localLabel}>of recent posts are about Chicago</Text>
        </View>
      )}

      {neighborhoods.length > 0 && (
        <View style={styles.row}>
          <Icon name="pin" size={13} color={C.accent} />
          <Text style={styles.rowText}>{neighborhoods.join(' · ')}</Text>
        </View>
      )}

      {topics.length > 0 && (
        <View style={styles.chips}>
          {topics.map(t => (
            <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 16, marginHorizontal: 16, marginBottom: 14,
    borderWidth: 1, borderColor: C.line, gap: 10,
  },
  eyebrow: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4, color: C.muted2 },
  localRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  localNum: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, color: C.ink, letterSpacing: -0.5 },
  localLabel: { fontFamily: F.body, fontSize: 14, color: C.inkSoft, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowText: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: C.accentTint, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: F.bodyMedium, fontSize: 12.5, color: C.accent },
} as any);
