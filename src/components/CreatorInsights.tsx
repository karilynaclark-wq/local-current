// Compact line under a creator's follower counts: the AI summary of a creator's recent posts
// (creators.ai_summary, written by the summarize-creator function).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, F } from '../theme';

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
  const topics = (summary.topics ?? []).slice(0, 4);
  if (!showLocal && !topics.length) return null;

  const topicLine = topics.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' · ');
  return (
    <View style={styles.wrap}>
      {showLocal && (
        <Text style={styles.local}>
          ~{Math.round(summary.local_share! * 100)}% of recent posts are about Chicago
        </Text>
      )}
      {topics.length > 0 && <Text style={styles.topics}>{topicLine}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 10 },
  local: { fontFamily: F.body, fontSize: 13, color: C.muted },
  topics: { fontFamily: F.bodyMedium, fontSize: 13.5, color: C.inkSoft },
} as any);
