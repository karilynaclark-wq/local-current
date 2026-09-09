/**
 * Circuit — "Current" shared UI primitives
 * Button, StatusChip, CircuitCard, SectionHeader, EmptyState
 * Import these in screens — do not duplicate styling.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle,
} from 'react-native';
import { C, F, R, S } from '../theme';
import { Icon } from './Icon';

// ─── Primary Button ──────────────────────────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  icon?: React.ReactNode;
  style?: ViewStyle;
}
export function Button({ label, onPress, disabled, loading, variant = 'primary', icon, style }: ButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.92}
      style={[
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnGhost,
        (disabled || loading) && styles.btnDisabled,
        style,
      ]}
    >
      {icon && <View style={{ marginRight: 8 }}>{icon}</View>}
      <Text style={[styles.btnText, !isPrimary && styles.btnGhostText]}>
        {loading ? 'Loading…' : label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Status Chip ─────────────────────────────────────────────────────────────
type StatusVariant = 'active' | 'completed' | 'claimed' | 'inactive' | 'redeemed';
interface ChipProps { status: StatusVariant; style?: ViewStyle; }
const CHIP_COLORS: Record<StatusVariant, { bg: string; text: string; dot: string }> = {
  active:    { bg: C.okSoft,    text: C.ok,          dot: C.ok },
  completed: { bg: C.okSoft,    text: C.ok,          dot: C.ok },
  redeemed:  { bg: C.accentSoft, text: C.accent,     dot: C.accent },
  claimed:   { bg: C.claimedBg, text: C.claimedText, dot: C.claimedDot },
  inactive:  { bg: C.line,      text: C.muted,       dot: C.muted2 },
};
export function StatusChip({ status, style }: ChipProps) {
  const col = CHIP_COLORS[status] ?? CHIP_COLORS.inactive;
  return (
    <View style={[styles.chip, { backgroundColor: col.bg }, style]}>
      <View style={[styles.chipDot, { backgroundColor: col.dot }]}/>
      <Text style={[styles.chipText, { color: col.text }]}>{status}</Text>
    </View>
  );
}

// ─── Section header (eyebrow + icon) ────────────────────────────────────────
interface SectionHeaderProps {
  label: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}
export function SectionHeader({ label, icon, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sec, style]}>
      {icon && <View style={styles.secIcon}>{icon}</View>}
      <Text style={styles.secText}>{label}</Text>
    </View>
  );
}

// ─── Circuit Card ────────────────────────────────────────────────────────────
interface CircuitCardProps {
  title: string;
  blurb?: string;
  bizName?: string;
  location?: string;
  status: StatusVariant;
  onPress?: () => void;
  style?: ViewStyle;
}
export function CircuitCard({ title, blurb, bizName, location, status, onPress, style }: CircuitCardProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={[styles.card, style]}>
      {bizName && <Text style={styles.cardBizName}>{bizName.toUpperCase()}</Text>}
      <View style={styles.cardHead}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
          {blurb ? <Text style={styles.cardSub} numberOfLines={2}>{blurb}</Text> : null}
        </View>
        <StatusChip status={status}/>
      </View>
      <View style={styles.cardRow}>
        {location ? (
          <View style={styles.locRow}>
            <Icon name="pin" size={14} color={C.accent}/>
            <Text style={styles.locText}>{location}</Text>
          </View>
        ) : <View/>}
        <View style={styles.linkRow}>
          <Text style={styles.linkText}>View details</Text>
          <Icon name="arrow" size={14} color={C.accent}/>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}
export function EmptyState({ icon, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.emptyWrap}>
      {icon && <View style={styles.emptyIcon}>{icon}</View>}
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} style={styles.emptyBtn}/>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Button
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: R.btn, paddingVertical: 16, paddingHorizontal: 20,
  },
  btnPrimary: { backgroundColor: C.accent, ...S.button },
  btnGhost: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line2 },
  btnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  btnText: {
    fontFamily: F.display, fontWeight: '700', fontSize: 16,
    letterSpacing: -0.16, color: '#fff',
  },
  btnGhostText: { color: C.ink },

  // Chip
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingLeft: 8, paddingRight: 10,
    borderRadius: R.pill, alignSelf: 'flex-start',
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: {
    fontFamily: F.bodyBold, fontSize: 11,
    letterSpacing: 0.44, textTransform: 'uppercase',
  },

  // Section header
  sec: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18, marginBottom: 13 },
  secIcon: { color: C.accent },
  secText: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink },

  // Card
  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: R.lg, padding: 16, marginBottom: 13,
    ...S.card,
  },
  cardBizName: {
    fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4,
    color: C.muted2, marginBottom: 7,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 20, letterSpacing: -0.2, color: C.ink },
  cardSub: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19.5, color: C.muted, marginTop: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locText: { fontFamily: F.body, fontSize: 12.5, color: C.muted },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },

  // Empty state
  emptyWrap: { alignItems: 'center', padding: 40, gap: 8 },
  emptyIcon: { marginBottom: 4 },
  emptyText: { fontFamily: F.body, fontSize: 13.5, color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 10, paddingHorizontal: 32, alignSelf: 'center' },
} as any);
