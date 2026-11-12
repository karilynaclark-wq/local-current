import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/analytics';
import { signOut } from '../../lib/auth';
import { C, F, R, S } from '../../theme';
import { Icon, SocialIcon } from '../../components/Icon';
import { ActivityIndicator } from 'react-native';
import WelcomeFlow, { type WelcomePage } from '../../components/WelcomeFlow';
import {
  connectTikTok, connectInstagram, getConnections,
  type SocialConnection, type Platform as SocialApi, type ConnectResult,
} from '../../lib/socialConnect';

// Shown once, right after sign-up, before the creator reaches the app.
const WELCOME_PAGES: WelcomePage[] = [
  { icon: 'sparkles', title: "You're in!", body: 'Welcome to Local Current. Free tickets to Chicago events are waiting.', cta: 'Show me how it works' },
  { icon: 'ticket', title: 'Get free tickets', body: 'Claim tickets instantly, or tap "Request an invite" on events where the business chooses who goes.', cta: 'Next' },
  { icon: 'pin', title: 'Go and have fun', body: 'Grab your tickets the way the business sets up, like a code or the guest list, then enjoy the night.', cta: 'Next' },
  { icon: 'film', title: 'Post within 48 hours', body: "Share an honest video and add #localcurrentapp to the caption so it's sent to the business.", cta: 'Next' },
  { icon: 'bell', title: "Don't miss a drop", body: "Tickets go fast. We'll let you know when an event opens to you and when a business picks you.", cta: 'Turn on notifications' },
];

const CONNECTORS: Record<SocialApi, { label: 'TikTok' | 'Instagram'; kind: 'tt' | 'ig'; connect: () => Promise<ConnectResult> }> = {
  tiktok: { label: 'TikTok', kind: 'tt', connect: connectTikTok },
  instagram: { label: 'Instagram', kind: 'ig', connect: connectInstagram },
};

function rangeFromCount(n: number): string {
  if (n < 1000) return 'Under 1K';
  if (n < 5000) return '1K–5K';
  if (n < 10000) return '5K–10K';
  if (n < 50000) return '10K–50K';
  if (n < 100000) return '50K–100K';
  return '100K+';
}

const CHICAGO_ZIPS = [
  '60601','60602','60603','60604','60605','60606','60607','60608','60609','60610',
  '60611','60612','60613','60614','60615','60616','60617','60618','60619','60620',
  '60621','60622','60623','60624','60625','60626','60628','60629','60630','60631',
  '60632','60633','60634','60636','60637','60638','60639','60640','60641','60642',
  '60643','60644','60645','60646','60647','60649','60651','60652','60653','60654',
  '60655','60656','60657','60659','60660','60661','60706','60707',
];

export default function CreatorOnboardingScreen() {
  const navigation = useNavigation<any>();

  const [city] = useState('Chicago');
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState<Partial<Record<SocialApi, SocialConnection>>>({});
  const [connecting, setConnecting] = useState<SocialApi | null>(null);
  // null = sign-up form; set once the account exists to show the welcome pages
  const [welcomePage, setWelcomePage] = useState<number | null>(null);
  const [firstName, setFirstName] = useState('');


  async function handleConnect(api: SocialApi) {
    const { label, connect } = CONNECTORS[api];
    setConnecting(api);
    try {
      const result = await connect();
      if (result === 'success') {
        const conn = (await getConnections()).find(c => c.platform === api);
        if (!conn) return;
        setVerified(v => ({ ...v, [api]: conn }));
        trackEvent('social_connected', { platform: api, context: 'creator_signup', followers: conn.follower_count });
      } else {
        trackEvent('social_connect_failed', { platform: api, reason: result, context: 'creator_signup' });
      }
      if (result === 'account_type') {
        Alert.alert('Personal account', "Instagram only lets Business or Creator accounts connect. You can switch to one for free in Instagram's settings, or connect TikTok instead.");
      } else if (result === 'not_configured') {
        Alert.alert('Coming soon', `${label} connection isn't available yet. Try the other platform.`);
      } else if (result === 'error') {
        Alert.alert('Could not connect', `${label} connection failed. Please try again.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setConnecting(null);
    }
  }

  async function handleSubmit() {
    const tt = verified.tiktok, ig = verified.instagram;
    if (!tt && !ig) {
      Alert.alert('Connect an account', 'Connect your TikTok or Instagram to continue.');
      return;
    }
    const zip = zipCode.trim();
    if (!zip) {
      Alert.alert('Zip code', 'Enter your zip code.');
      return;
    }
    if (!CHICAGO_ZIPS.includes(zip)) {
      trackEvent('signup_blocked', { role: 'creator', reason: 'outside_chicago' });
      Alert.alert('Sorry!', 'Local Current is only open to Chicago creators right now.');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
      if (!existingProfile) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: user.id,
          email: user.email ?? '',
          full_name: user.user_metadata?.full_name ?? '',
          role: 'creator',
        });
        if (profileError) throw profileError;
      }

      // Verified accounts fill the profile. The larger one is the main platform.
      const main = !tt ? ig! : !ig ? tt : (tt.follower_count >= ig.follower_count ? tt : ig);
      const second = main === tt ? ig : tt;
      const clean = (c?: SocialConnection) => c?.username?.replace(/^@/, '') ?? null;
      const { error } = await supabase.from('creators').insert({
        profile_id: user.id,
        main_platform: main.platform,
        follower_range: rangeFromCount(main.follower_count),
        secondary_platform: second?.platform ?? null,
        secondary_follower_range: second ? rangeFromCount(second.follower_count) : null,
        tiktok_handle: clean(tt),
        instagram_handle: clean(ig),
        tiktok_verified: !!tt,
        instagram_verified: !!ig,
        city,
        zip_code: zip,          // private: only used to confirm they're in Chicago
        outside_chicago: false,
        status: 'approved',     // verified account + Chicago zip → approved automatically
      });
      if (error) throw error;
      setFirstName(String(user.user_metadata?.full_name ?? '').split(' ')[0]);
      trackEvent('signup_completed', { role: 'creator', platforms: [tt && 'tiktok', ig && 'instagram'].filter(Boolean) });
      setWelcomePage(0);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  if (welcomePage !== null) {
    return <WelcomeFlow role="creator" pages={WELCOME_PAGES} firstName={firstName} onDone={() => { supabase.auth.refreshSession(); }} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tell us about yourself</Text>
          <Text style={styles.subtitle}>Connect at least one account to continue.</Text>

          {/* Verify with TikTok / Instagram */}
          <View style={{ gap: 10 }}>
            {(['tiktok', 'instagram'] as SocialApi[]).map(api => {
              const { label, kind } = CONNECTORS[api];
              const conn = verified[api];
              return conn ? (
                <View key={api} style={styles.verifiedCard}>
                  <SocialIcon kind={kind} size={20} color={C.ink} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.verifiedTitleRow}>
                      <Text style={styles.verifiedHandle}>
                        {conn.username ? `@${conn.username.replace(/^@/, '')}` : `${label} connected`}
                      </Text>
                      <View style={styles.verifiedBadge}>
                        <Icon name="check" size={10} color={C.ok} />
                        <Text style={styles.verifiedBadgeText}>Verified</Text>
                      </View>
                    </View>
                    <Text style={styles.verifiedStat}>{conn.follower_count.toLocaleString()} followers</Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity key={api} style={styles.connectCard} onPress={() => handleConnect(api)} disabled={!!connecting} activeOpacity={0.85}>
                  {connecting === api ? (
                    <ActivityIndicator color={C.accent} />
                  ) : (
                    <>
                      <SocialIcon kind={kind} size={20} color={C.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.connectCardTitle}>Connect {label}</Text>
                        <Text style={styles.connectCardSub}>
                          {api === 'instagram' ? 'Business or Creator accounts' : 'Verify your account and followers'}
                        </Text>
                      </View>
                      <Icon name="arrow" size={16} color={C.accent} />
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Zip code *</Text>
          <Text style={styles.hint}>Only used to confirm you're in Chicago. Never shown to anyone.</Text>
          <TextInput
            style={styles.input}
            value={zipCode}
            onChangeText={setZipCode}
            placeholder="e.g. 60614"
            placeholderTextColor={C.muted2}
            keyboardType="number-pad"
            maxLength={5}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Setting up…' : 'Continue'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => { await signOut().catch(() => {}); navigation.reset({ index: 0, routes: [{ name: 'RoleSelect' }] }); }} style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 13.5, color: C.muted }}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  scroll: { padding: 24, paddingBottom: 40 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, letterSpacing: -0.4, color: C.ink, marginBottom: 4 },
  subtitle: { fontFamily: F.body, fontSize: 14, color: C.muted, marginBottom: 24 },
  connectCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.accentTint, borderRadius: R.md, padding: 14,
    borderWidth: 1.5, borderColor: C.accentSoft,
  },
  connectCardTitle: { fontFamily: F.bodyBold, fontSize: 15, color: C.ink },
  connectCardSub: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 17 },
  verifiedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.okSoft, borderRadius: R.md, padding: 14,
    borderWidth: 1.5, borderColor: C.ok,
  },
  verifiedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedHandle: { fontFamily: F.bodyBold, fontSize: 15, color: C.ink },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.card, borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedBadgeText: { fontFamily: F.bodySemi, fontSize: 10, color: C.ok },
  verifiedStat: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 2 },
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft, marginTop: 18, marginBottom: 8 },
  hint: { fontFamily: F.body, fontSize: 12, color: C.muted2, marginTop: -4, marginBottom: 8 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill,
    borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card,
  },
  chipSelected: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.muted },
  chipTextSelected: { fontFamily: F.bodySemi, color: '#fff' },
  secondaryToggle: { marginTop: 20, marginBottom: 4 },
  secondaryToggleText: { fontFamily: F.bodySemi, color: C.accent, fontSize: 14 },
  button: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 16, alignItems: 'center', marginTop: 32, marginBottom: 16, ...(S.button as any),
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
});
