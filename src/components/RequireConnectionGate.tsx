// Blocks the creator app until a TikTok or Instagram account is connected.
// New creators connect during sign-up; this catches older accounts (and anyone
// who later disconnected). Follower counts and post imports rely on it.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Alert } from 'react-native';
import {
  getConnections, connectTikTok, connectInstagram,
  type Platform, type ConnectResult,
} from '../lib/socialConnect';
import { trackEvent } from '../lib/analytics';
import { signOut } from '../lib/auth';
import { C, F } from '../theme';
import { ConnectButton } from './SocialAccounts';

const CONNECT: Record<Platform, { label: string; fn: () => Promise<ConnectResult> }> = {
  tiktok: { label: 'TikTok', fn: connectTikTok },
  instagram: { label: 'Instagram', fn: connectInstagram },
};

export default function RequireConnectionGate({ onConnected }: { onConnected?: () => void }) {
  const [needed, setNeeded] = useState(false);
  const [busy, setBusy] = useState<Platform | null>(null);

  async function check() {
    const conns = await getConnections().catch(() => null);
    if (conns) setNeeded(!conns.some(c => c.connection_type === 'oauth'));
  }
  useEffect(() => { check(); }, []);

  async function connect(p: Platform) {
    setBusy(p);
    try {
      const result = await CONNECT[p].fn();
      trackEvent(result === 'success' ? 'social_connected' : 'social_connect_failed', { platform: p, reason: result, context: 'required_gate' });
      if (result === 'success') { await check(); onConnected?.(); }
      else if (result === 'account_type') {
        Alert.alert('Personal account', "Instagram only lets Business or Creator accounts connect. You can switch for free in Instagram: Settings → Account type and tools → Switch to professional account.");
      } else if (result !== 'cancel') {
        Alert.alert('Could not connect', `${CONNECT[p].label} connection failed. Please try again.`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={needed} animationType="slide" presentationStyle="fullScreen">
      <View style={st.wrap}>
        <Text style={st.title}>Connect your account</Text>
        <Text style={st.body}>
          Local Current now requires a connected TikTok or Instagram. It's how we confirm your follower count
          and find your posts about events automatically.
        </Text>
        <Text style={st.note}>Instagram needs a free Business or Creator account.</Text>
        <View style={{ gap: 12, marginTop: 8 }}>
          {(['tiktok', 'instagram'] as Platform[]).map(p => (
            <ConnectButton key={p} platform={p} busy={busy === p} onPress={() => connect(p)} />
          ))}
        </View>
        <Text style={st.signOut} onPress={() => signOut()}>Log out</Text>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paper, padding: 28, paddingTop: 90, gap: 12 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, color: C.ink },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.inkSoft },
  note: { fontFamily: F.body, fontSize: 13, color: C.muted },
  signOut: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 24 },
} as any);
