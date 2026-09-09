import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { C, F } from '../theme';

/** The "current wave" mark — AC waveform between two nodes */
export function WaveMark({
  size = 32,
  waveColor = C.accent,
  leftNodeColor = '#241D17',
  rightNodeColor = C.accent,
}: {
  size?: number;
  waveColor?: string;
  leftNodeColor?: string;
  rightNodeColor?: string;
}) {
  // viewBox is 52×28; scale height proportionally
  const h = size * (28 / 52);
  const sw = size < 24 ? 3.6 : 3.2;
  const nr = size < 24 ? 4 : 3.6;
  return (
    <Svg width={size} height={h} viewBox="0 0 52 28" fill="none">
      <Path
        d="M6 14 q5 -11 10 0 t10 0 t10 0"
        stroke={waveColor}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="6" cy="14" r={nr} fill={leftNodeColor} />
      <Circle cx="46" cy="14" r={nr} fill={rightNodeColor} />
    </Svg>
  );
}

/**
 * Stacked lockup: [mark]  LOCAL
 *                          Current
 *
 * size="sm"  → header bars (mark ~28px)
 * size="lg"  → splash / onboarding (mark ~44px)
 */
export function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const markSize = size === 'lg' ? 44 : 28;
  const kicSize  = size === 'lg' ? 11  : 9;
  const wdSize   = size === 'lg' ? 30  : 20;
  const gap      = size === 'lg' ? 12  : 8;

  return (
    <View style={[styles.row, { gap }]}>
      <WaveMark size={markSize} />
      <View style={styles.stack}>
        <Text style={[styles.kicker, { fontSize: kicSize }]}>LOCAL</Text>
        <Text style={[styles.wordmark, { fontSize: wdSize }]}>Current</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  stack: {
    flexDirection: 'column',
    gap: 0,
  },
  kicker: {
    fontFamily: F.monoMedium,
    fontWeight: '500',
    letterSpacing: 2,
    color: C.accent,
    lineHeight: 14,
    marginLeft: 2,
  },
  wordmark: {
    fontFamily: F.displayXBold,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: C.ink,
    lineHeight: 28,
    marginTop: -2,
  },
});
