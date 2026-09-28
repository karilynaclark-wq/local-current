// Business-side list of creator requests for one current: approve (sending
// free-text access details) or decline. Capacity + ownership are enforced
// server-side by the respond_to_request RPC.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform as RNPlatform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { getPushToken, sendPush } from '../lib/notifications';
import { C, F, R } from '../theme';
import { Icon, SocialIcon } from './Icon';
import { FILLED_STATUSES, type RedemptionStatus } from '../types';

export interface RequestRow {
  id: string;
  status: RedemptionStatus;
  requested_at: string | null;
  claimed_at?: string | null;
  access_details: string | null;
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

function hoursLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() + 48 * 3_600_000 - Date.now()) / 3_600_000));
}

/** Each platform's tier: the main platform uses follower_range, the other secondary. */
function platformLines(c: NonNullable<RequestRow['creator']>) {
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

export default function RequestsSection({ circuit, rows, onChanged, onOpenCreator }: {
  circuit: { id: string; title: string; max_redemptions: number | null; guest_count: number | null };
  rows: RequestRow[];
  onChanged: () => void;
  onOpenCreator: (creatorId: string) => void;
}) {
  const [approving, setApproving] = useState<RequestRow | null>(null);
  const [details, setDetails] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = rows
    .filter(r => r.status === 'requested')
    .sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? ''));
  const approved = rows.filter(r => FILLED_STATUSES.includes(r.status));
  const lastDetails = [...approved].reverse().find(r => r.access_details)?.access_details ?? '';
  const spots = circuit.max_redemptions;
  const full = spots != null && approved.length >= spots;
  const guests = circuit.guest_count ?? 0;

  function openApprove(row: RequestRow) {
    if (full) {
      Alert.alert('All spots filled', 'Give yourself more spots or decline this request.');
      return;
    }
    setDetails(lastDetails);
    setApproving(row);
  }

  async function notify(row: RequestRow, title: string, body: string) {
    if (!row.creator?.profile_id) return;
    const token = await getPushToken(row.creator.profile_id);
    if (token) sendPush(token, title, body);
  }

  async function respond(row: RequestRow, approve: boolean, text?: string) {
    setBusyId(row.id);
    try {
      const { error } = await supabase.rpc('respond_to_request', {
        p_redemption_id: row.id,
        p_approve: approve,
        p_details: text ?? null,
      });
      if (error) throw error;
      if (approve) {
        await notify(row, "You're in! 🎉", `You were approved for "${circuit.title}". Open the app for your access details.`);
      } else {
        await notify(row, 'Update on your request', `"${circuit.title}" went with other creators this time. More currents are waiting!`);
      }
      setApproving(null);
      onChanged();
    } catch (e: any) {
      Alert.alert('Could not update request', e.message);
    } finally {
      setBusyId(null);
    }
  }

  function confirmDecline(row: RequestRow) {
    Alert.alert('Decline request?', `${row.creator?.profile?.full_name ?? 'This creator'} will be notified.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => respond(row, false) },
    ]);
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Requests{pending.length ? ` (${pending.length})` : ''}</Text>
        {spots != null && (
          <Text style={[styles.spots, full && styles.spotsFull]}>
            {approved.length} of {spots} spots filled
          </Text>
        )}
      </View>

      {pending.length === 0 ? (
        <Text style={styles.empty}>No pending requests right now. We'll notify you when creators ask to join.</Text>
      ) : pending.map(row => {
        const c = row.creator;
        const left = hoursLeft(row.requested_at ?? row.claimed_at);
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
              Requested {timeAgo(row.requested_at ?? row.claimed_at)}
              {left != null ? `  ·  expires in ${left}h` : ''}
            </Text>
            <View style={styles.actions}>
              {busyId === row.id ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <>
                  <TouchableOpacity style={styles.declineBtn} onPress={() => confirmDecline(row)}>
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.approveBtn, full && { opacity: 0.5 }]} onPress={() => openApprove(row)}>
                    <Text style={styles.approveText}>Approve</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        );
      })}

      {approved.length > 0 && (
        <>
          <Text style={styles.subTitle}>Approved</Text>
          {approved.map(row => (
            <TouchableOpacity
              key={row.id}
              style={styles.approvedRow}
              onPress={() => row.creator && onOpenCreator(row.creator.id)}
              activeOpacity={0.7}
            >
              <Icon name="check" size={13} color={C.ok} />
              <View style={{ flex: 1 }}>
                <Text style={styles.approvedName}>{row.creator?.profile?.full_name ?? 'Creator'}</Text>
                {row.access_details ? (
                  <Text style={styles.approvedDetails} numberOfLines={2}>Sent: {row.access_details}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      <Modal visible={!!approving} transparent animationType="slide" onRequestClose={() => setApproving(null)}>
        <KeyboardAvoidingView behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Approve {approving?.creator?.profile?.full_name ?? 'creator'}</Text>
              <TouchableOpacity onPress={() => setApproving(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={20} color={C.muted2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetHint}>
              What do they need to attend{guests > 0 ? ` (covers them + ${guests} friend${guests > 1 ? 's' : ''})` : ''}?
              They'll see this in the app.
            </Text>
            <TextInput
              style={styles.input}
              value={details}
              onChangeText={setDetails}
              placeholder={'e.g. Use code SUMMER25 at checkout\ne.g. You\'re on the list under your name\ne.g. Tickets: https://…'}
              placeholderTextColor={C.muted2}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!details.trim() || busyId) && { opacity: 0.5 }]}
              disabled={!details.trim() || !!busyId}
              onPress={() => approving && respond(approving, true, details)}
            >
              <Text style={styles.sendText}>{busyId ? 'Sending…' : 'Approve & send'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 6, justifyContent: 'flex-end' },
  declineBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: R.md,
    borderWidth: 1.5, borderColor: C.line2,
  },
  declineText: { fontFamily: F.bodySemi, fontSize: 14, color: C.inkSoft },
  approveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.accent },
  approveText: { fontFamily: F.bodySemi, fontSize: 14, color: '#fff' },
  subTitle: { fontFamily: F.bodySemi, fontSize: 13, color: C.muted, marginTop: 6 },
  approvedRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  approvedName: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  approvedDetails: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 18, color: C.ink, flex: 1 },
  sheetHint: { fontFamily: F.body, fontSize: 13.5, color: C.muted, lineHeight: 19 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card, minHeight: 110, textAlignVertical: 'top',
  },
  sendBtn: { backgroundColor: C.accent, borderRadius: R.btn, padding: 15, alignItems: 'center', marginTop: 4 },
  sendText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
});
