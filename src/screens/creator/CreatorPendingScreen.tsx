import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { signOut } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

export default function CreatorPendingScreen() {
  const [status, setStatus] = useState<'pending' | 'rejected'>('pending');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('creators').select('status').eq('profile_id', user.id).single()
        .then(({ data }) => { if (data?.status === 'rejected') setStatus('rejected'); });
    });
  }, []);

  const isRejected = status === 'rejected';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, isRejected && styles.iconWrapRejected]}>
          <Icon name={isRejected ? 'close' : 'bell'} size={36} color={isRejected ? '#DC2626' : C.accent} />
        </View>
        <Text style={styles.title}>{isRejected ? 'Application not approved' : 'Application submitted!'}</Text>
        <Text style={styles.body}>
          {isRejected
            ? "We reviewed your application and weren't able to approve it at this time. This is usually because your account is too new, your follower count is below our current threshold, or your content doesn't yet match what our business partners are looking for. If you think this is a mistake, email us at hello@join-circuit.com."
            : "Our team reviews every creator to keep the Local Current network high quality. In the meantime, feel free to browse — you'll be able to claim currents as soon as you're approved. Usually within 24–48 hours."}
        </Text>
        {!isRejected && (
          <View style={styles.steps}>
            <Text style={styles.stepsTitle}>What happens next:</Text>
            <Text style={styles.step}>1. We review your profile and social presence</Text>
            <Text style={styles.step}>2. You'll receive an approval email</Text>
            <Text style={styles.step}>3. Browse and claim your first current!</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={signOut} style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper, padding: 24 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconWrap: {
    width: 80, height: 80, borderRadius: R.lg,
    backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  iconWrapRejected: { backgroundColor: '#FEF2F2' },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, letterSpacing: -0.4, color: C.ink, marginBottom: 12, textAlign: 'center' },
  body: { fontFamily: F.body, fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  steps: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 20, width: '100%',
    borderWidth: 1, borderColor: C.line,
  },
  stepsTitle: { fontFamily: F.bodySemi, color: C.ink, marginBottom: 12 },
  step: { fontFamily: F.body, fontSize: 14, color: C.inkSoft, marginBottom: 8, lineHeight: 20 },
  signOut: { alignItems: 'center', paddingVertical: 16 },
  signOutText: { fontFamily: F.body, color: C.muted2, fontSize: 14 },
});
