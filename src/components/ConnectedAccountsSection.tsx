// Connect / disconnect / reconnect TikTok and Instagram (Settings screen).

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { C, F } from '../theme';
import {
  getConnections, connectTikTok, syncTikTok, disconnectTikTok,
  connectInstagram, syncInstagram, disconnectInstagram, saveManualConnection,
  type SocialConnection, type Platform, type ConnectResult,
} from '../lib/socialConnect';
import { ConnectedAccountRow, ConnectButton, ManualEntrySheet } from './SocialAccounts';

const PLATFORM_API: Record<Platform, {
  label: string;
  connect: () => Promise<ConnectResult>;
  sync: () => Promise<void>;
  disconnect: () => Promise<void>;
}> = {
  tiktok: { label: 'TikTok', connect: connectTikTok, sync: syncTikTok, disconnect: disconnectTikTok },
  instagram: { label: 'Instagram', connect: connectInstagram, sync: syncInstagram, disconnect: disconnectInstagram },
};

export default function ConnectedAccountsSection() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [manualFor, setManualFor] = useState<Platform | null>(null);

  useEffect(() => { getConnections().then(setConnections).catch(() => {}); }, []);

  async function handleConnect(platform: Platform) {
    const { label, connect } = PLATFORM_API[platform];
    setConnecting(platform);
    try {
      const result = await connect();
      if (result === 'success') {
        setConnections(await getConnections());
        Alert.alert('Connected', `Your ${label} account is now linked.`);
      } else if (result === 'account_type') {
        Alert.alert(
          'Personal account',
          'Instagram only lets Business or Creator accounts connect. Switch to a professional account in Instagram settings, or add your details manually.',
          [{ text: 'OK' }, { text: 'Add manually', onPress: () => setManualFor(platform) }],
        );
      } else if (result === 'not_configured') {
        Alert.alert('Coming soon', `${label} connection isn't available yet. You can add your details manually for now.`);
      } else if (result === 'error') {
        Alert.alert('Could not connect', `${label} connection failed. Please try again.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setConnecting(null);
    }
  }

  function handleDisconnect(platform: Platform) {
    const { label, disconnect } = PLATFORM_API[platform];
    Alert.alert(`Disconnect ${label}`, `Remove your linked ${label} account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          await disconnect();
          setConnections(await getConnections());
        },
      },
    ]);
  }

  async function handleManualSave(handle: string, followers: number) {
    if (!manualFor) return;
    await saveManualConnection(manualFor, handle, followers);
    setConnections(await getConnections());
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Connected accounts</Text>
      <View style={styles.connectSection}>
        {(['tiktok', 'instagram'] as Platform[]).map(platform => {
          const conn = connections.find(c => c.platform === platform);
          return conn ? (
            <ConnectedAccountRow
              key={platform}
              conn={conn}
              busy={connecting === platform}
              onDisconnect={() => handleDisconnect(platform)}
              onReconnect={() => handleConnect(platform)}
            />
          ) : (
            <ConnectButton
              key={platform}
              platform={platform}
              busy={connecting === platform}
              onPress={() => handleConnect(platform)}
              onManual={platform === 'instagram' ? () => setManualFor(platform) : undefined}
            />
          );
        })}
      </View>
      <ManualEntrySheet
        platform={manualFor ?? 'instagram'}
        visible={!!manualFor}
        onClose={() => setManualFor(null)}
        onSave={handleManualSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  sectionTitle: { fontFamily: F.mono, fontSize: 11, color: C.muted2, textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 4, marginBottom: 2 },
  connectSection: { gap: 10 },
} as any);
