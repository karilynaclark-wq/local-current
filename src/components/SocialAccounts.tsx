// Shared UI for linking social accounts: a connected-account row, a connect
// button, and a sheet for manually entering a handle + follower count (the
// fallback for Instagram personal accounts the API can't read).

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Linking,
  ActivityIndicator, KeyboardAvoidingView, Platform as RNPlatform,
} from 'react-native';
import { C, F, R } from '../theme';
import { Icon, SocialIcon } from './Icon';
import AtInput from './AtInput';
import type { Platform, SocialConnection } from '../lib/socialConnect';

const LABEL: Record<Platform, string> = { tiktok: 'TikTok', instagram: 'Instagram' };
const KIND: Record<Platform, 'tt' | 'ig'> = { tiktok: 'tt', instagram: 'ig' };

export function ConnectedAccountRow({ conn, busy, onDisconnect, onReconnect }: {
  conn: SocialConnection;
  busy: boolean;
  onDisconnect: () => void;
  onReconnect?: () => void;
}) {
  const verified = conn.connection_type === 'oauth';
  return (
    <View style={styles.row}>
      <SocialIcon kind={KIND[conn.platform]} size={18} color={C.ink} />
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.handle}>
            {conn.username ? `@${conn.username.replace(/^@/, '')}` : LABEL[conn.platform]}
          </Text>
          {verified ? (
            <View style={styles.verifiedBadge}>
              <Icon name="check" size={10} color={C.ok} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : (
            <View style={styles.manualBadge}>
              <Text style={styles.manualText}>Self-reported</Text>
            </View>
          )}
        </View>
        <Text style={styles.stat}>
          {conn.follower_count.toLocaleString()} followers
          {conn.media_count ? `  ·  ${conn.media_count} posts` : ''}
        </Text>
        {conn.needs_reconnect && onReconnect && (
          <TouchableOpacity onPress={onReconnect} activeOpacity={0.7}>
            <Text style={styles.reconnectText}>⚠ Connection expired — tap to reconnect</Text>
          </TouchableOpacity>
        )}
      </View>
      {busy ? (
        <ActivityIndicator color={C.accent} />
      ) : (
        <>
          {conn.profile_url && (
            <TouchableOpacity onPress={() => Linking.openURL(conn.profile_url!)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="arrow" size={16} color={C.muted2} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDisconnect} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={16} color={C.muted2} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

export function ConnectButton({ platform, busy, onPress, onManual }: {
  platform: Platform;
  busy: boolean;
  onPress: () => void;
  onManual?: () => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <TouchableOpacity style={styles.connectBtn} onPress={onPress} disabled={busy} activeOpacity={0.85}>
        {busy ? (
          <ActivityIndicator color={C.ink} />
        ) : (
          <>
            <SocialIcon kind={KIND[platform]} size={16} color={C.ink} />
            <Text style={styles.connectBtnText}>Connect {LABEL[platform]}</Text>
          </>
        )}
      </TouchableOpacity>
      {onManual && (
        <TouchableOpacity onPress={onManual} disabled={busy} activeOpacity={0.7}>
          <Text style={styles.manualLink}>Personal account? Add it manually</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function ManualEntrySheet({ platform, visible, onClose, onSave }: {
  platform: Platform;
  visible: boolean;
  onClose: () => void;
  onSave: (handle: string, followers: number) => Promise<void>;
}) {
  const [handle, setHandle] = useState('');
  const [followers, setFollowers] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const count = parseInt(followers.replace(/[^0-9]/g, ''), 10);
    if (!handle.trim() || isNaN(count)) {
      setError('Enter your handle and follower count.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(handle.trim(), count);
      setHandle('');
      setFollowers('');
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add {LABEL[platform]} manually</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={20} color={C.muted2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sheetHint}>
            {platform === 'instagram'
              ? 'Instagram only lets Business and Creator accounts connect. For a personal account, enter your details — they’ll show as self-reported.'
              : 'Your details will show as self-reported.'}
          </Text>

          <Text style={styles.label}>Handle</Text>
          <AtInput value={handle} onChangeText={setHandle} />

          <Text style={styles.label}>Follower count</Text>
          <TextInput
            style={styles.input}
            value={followers}
            onChangeText={setFollowers}
            placeholder="e.g. 4200"
            placeholderTextColor={C.muted2}
            keyboardType="number-pad"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.paper, borderWidth: 1, borderColor: C.line2,
    borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  handle: { fontFamily: F.bodyBold, fontSize: 14, color: C.ink },
  stat: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 1 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.okSoft, borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedText: { fontFamily: F.bodySemi, fontSize: 10, color: C.ok },
  manualBadge: { backgroundColor: C.line, borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2 },
  manualText: { fontFamily: F.bodySemi, fontSize: 10, color: C.muted },
  reconnectText: { fontFamily: F.bodySemi, fontSize: 12, color: '#DC2626', marginTop: 3 },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, paddingVertical: 12,
  },
  connectBtnText: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  manualLink: { fontFamily: F.bodySemi, fontSize: 12.5, color: C.accent, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 18, color: C.ink },
  sheetHint: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 8 },
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft, marginTop: 14, marginBottom: 6 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card,
  },
  error: { fontFamily: F.body, fontSize: 13, color: '#DC2626', marginTop: 10 },
  saveBtn: { backgroundColor: C.accent, borderRadius: R.btn, padding: 15, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
});
