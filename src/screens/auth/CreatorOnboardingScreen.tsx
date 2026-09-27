import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AtInput from '../../components/AtInput';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';
import { Icon, SocialIcon } from '../../components/Icon';
import { ActivityIndicator } from 'react-native';
import { connectTikTok, getConnections, type SocialConnection } from '../../lib/socialConnect';

function rangeFromCount(n: number): string {
  if (n < 1000) return 'Under 1K';
  if (n < 5000) return '1K–5K';
  if (n < 10000) return '5K–10K';
  if (n < 50000) return '10K–50K';
  if (n < 100000) return '50K–100K';
  return '100K+';
}

const PLATFORMS = ['Instagram', 'TikTok'] as const;
type SocialPlatform = typeof PLATFORMS[number];

const FOLLOWER_RANGES = ['Under 1K', '1K–5K', '5K–10K', '10K–50K', '50K–100K', '100K+'];

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

  const [mainPlatform, setMainPlatform] = useState<SocialPlatform | null>(null);
  const [handle, setHandle] = useState('');
  const [followerRange, setFollowerRange] = useState('');
  const [hasSecondary, setHasSecondary] = useState(false);
  const [secondaryPlatform, setSecondaryPlatform] = useState<SocialPlatform | null>(null);
  const [secondaryHandle, setSecondaryHandle] = useState('');
  const [secondaryFollowers, setSecondaryFollowers] = useState('');
  const [city] = useState('Chicago');
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [tiktokConn, setTiktokConn] = useState<SocialConnection | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function handleConnectTikTok() {
    setConnecting(true);
    try {
      const result = await connectTikTok();
      if (result === 'success') {
        const conns = await getConnections();
        const tt = conns.find(c => c.platform === 'tiktok') ?? null;
        setTiktokConn(tt);
        if (tt) {
          // Auto-fill from the verified account
          setMainPlatform('TikTok');
          if (tt.username) setHandle(tt.username.replace(/^@/, ''));
          setFollowerRange(rangeFromCount(tt.follower_count));
        }
      } else if (result === 'error') {
        Alert.alert('Could not connect', 'TikTok connection failed. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleSubmit() {
    if (!mainPlatform || !handle || !followerRange || !zipCode) {
      Alert.alert('Required', 'Please fill in all required fields including your zip code.');
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

      const { error } = await supabase.from('creators').insert({
        profile_id: user.id,
        main_platform: mainPlatform.toLowerCase(),
        instagram_handle: mainPlatform === 'Instagram' ? handle : (secondaryPlatform === 'Instagram' ? secondaryHandle : null),
        tiktok_handle: mainPlatform === 'TikTok' ? handle : (secondaryPlatform === 'TikTok' ? secondaryHandle : null),
        follower_range: followerRange,
        secondary_platform: secondaryPlatform?.toLowerCase() ?? null,
        secondary_follower_range: secondaryFollowers || null,
        city,
        zip_code: zipCode.trim(),
        outside_chicago: !CHICAGO_ZIPS.includes(zipCode.trim()),
        status: 'pending',
      });
      if (error) throw error;
      // Creating the creator row sets status = 'pending'. Refreshing the session
      // re-runs RootNavigator's status check, which swaps to CreatorTabs (pending)
      // automatically — no manual navigation needed (and 'CreatorPending' isn't in
      // this navigator, which is what caused the REPLACE error).
      await supabase.auth.refreshSession();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const secondaryOptions = PLATFORMS.filter(p => p !== mainPlatform);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tell us about yourself</Text>
          <Text style={styles.subtitle}>Help us match you with the right currents</Text>

          {/* Verify with TikTok */}
          {tiktokConn ? (
            <View style={styles.verifiedCard}>
              <SocialIcon kind="tt" size={20} color={C.ink} />
              <View style={{ flex: 1 }}>
                <View style={styles.verifiedTitleRow}>
                  <Text style={styles.verifiedHandle}>
                    {tiktokConn.username ? `@${tiktokConn.username.replace(/^@/, '')}` : 'TikTok connected'}
                  </Text>
                  <View style={styles.verifiedBadge}>
                    <Icon name="check" size={10} color={C.ok} />
                    <Text style={styles.verifiedBadgeText}>Verified</Text>
                  </View>
                </View>
                <Text style={styles.verifiedStat}>{tiktokConn.follower_count.toLocaleString()} followers</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.connectCard} onPress={handleConnectTikTok} disabled={connecting} activeOpacity={0.85}>
              {connecting ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <>
                  <SocialIcon kind="tt" size={20} color={C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectCardTitle}>Connect TikTok</Text>
                    <Text style={styles.connectCardSub}>Verify your account to auto-fill your stats — recommended</Text>
                  </View>
                  <Icon name="arrow" size={16} color={C.accent} />
                </>
              )}
            </TouchableOpacity>
          )}

          <Text style={styles.label}>Main platform *</Text>
          <View style={styles.chipRow}>
            {PLATFORMS.map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, mainPlatform === p && styles.chipSelected]}
                onPress={() => { setMainPlatform(p); setSecondaryPlatform(null); }}
              >
                <Text style={[styles.chipText, mainPlatform === p && styles.chipTextSelected]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Handle *</Text>
          <AtInput value={handle} onChangeText={setHandle} />

          <Text style={styles.label}>Follower range *</Text>
          <View style={styles.chipRow}>
            {FOLLOWER_RANGES.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, followerRange === r && styles.chipSelected]}
                onPress={() => setFollowerRange(r)}
              >
                <Text style={[styles.chipText, followerRange === r && styles.chipTextSelected]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.secondaryToggle} onPress={() => setHasSecondary(!hasSecondary)}>
            <Text style={styles.secondaryToggleText}>
              {hasSecondary ? '− Remove secondary platform' : '+ Add secondary platform (optional)'}
            </Text>
          </TouchableOpacity>

          {hasSecondary && (
            <>
              <Text style={styles.label}>Secondary platform</Text>
              <View style={styles.chipRow}>
                {secondaryOptions.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, secondaryPlatform === p && styles.chipSelected]}
                    onPress={() => setSecondaryPlatform(p)}
                  >
                    <Text style={[styles.chipText, secondaryPlatform === p && styles.chipTextSelected]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Secondary handle</Text>
              <AtInput value={secondaryHandle} onChangeText={setSecondaryHandle} />

              <Text style={styles.label}>Secondary follower range</Text>
              <View style={styles.chipRow}>
                {FOLLOWER_RANGES.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, secondaryFollowers === r && styles.chipSelected]}
                    onPress={() => setSecondaryFollowers(r)}
                  >
                    <Text style={[styles.chipText, secondaryFollowers === r && styles.chipTextSelected]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>Zip code *</Text>
          <Text style={styles.hint}>Must be a Chicago zip code — that's the only city available right now</Text>
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
            <Text style={styles.buttonText}>{loading ? 'Submitting…' : 'Submit for approval'}</Text>
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
