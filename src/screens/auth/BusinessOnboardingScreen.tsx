import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import AtInput from '../../components/AtInput';
import AddressFields from '../../components/AddressFields';
import { EMPTY_ADDRESS, formatAddress, validateAddress, type AddressParts } from '../../lib/address';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';
import { Icon, SocialIcon } from '../../components/Icon';
import {
  connectTikTok, connectInstagram, getConnections,
  type SocialConnection, type Platform as SocialApi, type ConnectResult,
} from '../../lib/socialConnect';

const CONNECTORS: Record<SocialApi, { label: string; kind: 'tt' | 'ig'; connect: () => Promise<ConnectResult> }> = {
  instagram: { label: 'Instagram', kind: 'ig', connect: connectInstagram },
  tiktok: { label: 'TikTok', kind: 'tt', connect: connectTikTok },
};

type Step = 1 | 2;

export default function BusinessOnboardingScreen() {
  const navigation = useNavigation<any>();
  const [step, setStep] = useState<Step>(1);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [verified, setVerified] = useState<Partial<Record<SocialApi, SocialConnection>>>({});
  const [connecting, setConnecting] = useState<SocialApi | null>(null);
  const [manualOpen, setManualOpen] = useState<Partial<Record<SocialApi, boolean>>>({});

  // The account is created at step 1. If we're (re)mounted with a session
  // already present, resume at step 2.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAccountCreated(true);
        setStep(2);
        getConnections().then(conns => {
          const v: Partial<Record<SocialApi, SocialConnection>> = {};
          for (const c of conns) if (c.connection_type === 'oauth') v[c.platform] = c;
          setVerified(v);
        }).catch(() => {});
      }
    });
  }, []);

  async function handleConnect(api: SocialApi) {
    const { label, connect } = CONNECTORS[api];
    setConnecting(api);
    try {
      const result = await connect();
      if (result === 'success') {
        const conn = (await getConnections()).find(c => c.platform === api);
        if (!conn) return;
        setVerified(v => ({ ...v, [api]: conn }));
        const h = conn.username?.replace(/^@/, '') ?? '';
        if (h) (api === 'instagram' ? setInstagram : setTiktok)(h);
      } else if (result === 'account_type') {
        Alert.alert('Personal account', 'Instagram only lets Business or Creator accounts connect. Just type your handle below instead.');
      } else if (result === 'not_configured') {
        Alert.alert('Coming soon', `${label} connection isn't available yet — type your handle below.`);
      } else if (result === 'error') {
        Alert.alert('Could not connect', `${label} connection failed. Please try again.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setConnecting(null);
    }
  }

  async function handleStep1() {
    if (!fullName || !email || !password) {
      Alert.alert('Required', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    if (accountCreated) { setStep(2); return; }
    setLoading(true);
    try {
      // Create the account now so step 2 can connect social accounts (which
      // requires a signed-in user). The navigator keeps business accounts on
      // this screen until the businesses row is saved.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'business' } },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Sign up failed');

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: 'business',
      });
      if (profileError) throw profileError;
      setAccountCreated(true);
      setStep(2);
    } catch (e: any) {
      if (e.message?.includes('already registered') || e.message?.includes('duplicate key')) {
        Alert.alert('Account already exists', 'This email already has an account — log in instead.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!businessName) {
      Alert.alert('Required', 'Please enter your business name.');
      return;
    }
    const addressError = validateAddress(address);
    if (addressError) {
      Alert.alert('Address', addressError);
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in — please go back and create your account.');

      const { error: bizError } = await supabase.from('businesses').insert({
        profile_id: user.id,
        business_name: businessName.replace(/\b\w/g, c => c.toUpperCase()),
        website,
        description,
        address: formatAddress(address),
        instagram_handle: instagram,
        tiktok_handle: tiktok,
        subscription_tier: 'starter',
      });
      if (bizError) throw bizError;
      await supabase.auth.refreshSession();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Progress dots */}
          <View style={styles.progressRow}>
            <View style={[styles.progressDot, styles.progressDotActive]} />
            <View style={[styles.progressLine, step === 2 && styles.progressLineActive]} />
            <View style={[styles.progressDot, step === 2 && styles.progressDotActive]} />
          </View>

          {step === 1 ? (
            <>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>

              <Text style={styles.title}>Set up your account</Text>
              <Text style={styles.subtitle}>You'll use this to log in</Text>

              <Text style={styles.label}>Your full name *</Text>
              <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Jane Smith" placeholderTextColor={C.muted2} autoCapitalize="words" />

              <Text style={styles.label}>Email *</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@yourbusiness.com" placeholderTextColor={C.muted2} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.label}>Password *</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Min. 8 characters" placeholderTextColor={C.muted2} secureTextEntry />

              <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleStep1} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Continue'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {!accountCreated && (
                <TouchableOpacity onPress={() => setStep(1)} style={styles.back}>
                  <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.title}>Tell us about your business</Text>
              <Text style={styles.subtitle}>This is what creators will see</Text>

              <Text style={styles.label}>Business name *</Text>
              <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Jo's Coffee" placeholderTextColor={C.muted2} />

              <Text style={styles.label}>Website</Text>
              <TextInput style={styles.input} value={website} onChangeText={setWebsite} placeholder="https://yourbusiness.com" placeholderTextColor={C.muted2} autoCapitalize="none" keyboardType="url" />

              <Text style={styles.label}>About</Text>
              <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Tell creators what makes your business special..." placeholderTextColor={C.muted2} multiline numberOfLines={3} />

              <AddressFields value={address} onChange={setAddress} required />

              <Text style={styles.sectionHeader}>Social</Text>
              <Text style={styles.socialHint}>Make sure to include this if you want creators to tag you when they post about you!</Text>

              {(['instagram', 'tiktok'] as SocialApi[]).map(api => {
                const { label, kind } = CONNECTORS[api];
                const conn = verified[api];
                const value = api === 'instagram' ? instagram : tiktok;
                const setValue = api === 'instagram' ? setInstagram : setTiktok;
                return (
                  <View key={api}>
                    <Text style={styles.label}>{label}</Text>
                    {conn ? (
                      <View style={styles.verifiedCard}>
                        <SocialIcon kind={kind} size={18} color={C.ink} />
                        <Text style={styles.verifiedHandle}>@{(conn.username ?? value).replace(/^@/, '')}</Text>
                        <View style={styles.verifiedBadge}>
                          <Icon name="check" size={10} color={C.ok} />
                          <Text style={styles.verifiedBadgeText}>Verified</Text>
                        </View>
                      </View>
                    ) : (
                      <>
                        <TouchableOpacity style={styles.connectCard} onPress={() => handleConnect(api)} disabled={!!connecting} activeOpacity={0.85}>
                          {connecting === api ? (
                            <ActivityIndicator color={C.accent} />
                          ) : (
                            <>
                              <SocialIcon kind={kind} size={18} color={C.accent} />
                              <Text style={styles.connectCardTitle}>Connect {label}</Text>
                              <Icon name="arrow" size={16} color={C.accent} />
                            </>
                          )}
                        </TouchableOpacity>
                        {manualOpen[api] ? (
                          <View style={{ marginTop: 8 }}>
                            <AtInput value={value} onChangeText={setValue} placeholder="yourbusiness" />
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => setManualOpen(m => ({ ...m, [api]: true }))} activeOpacity={0.7}>
                            <Text style={styles.orText}>or type your handle instead</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                );
              })}

              <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Setting up…' : 'Launch my dashboard'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  scroll: { padding: 24 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.line2 },
  progressDotActive: { backgroundColor: C.accent },
  progressLine: { flex: 1, height: 2, backgroundColor: C.line2, marginHorizontal: 6 },
  progressLineActive: { backgroundColor: C.accent },
  back: { marginBottom: 16 },
  backText: { fontFamily: F.bodySemi, color: C.accent, fontSize: 15 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, letterSpacing: -0.4, color: C.ink, marginBottom: 4 },
  subtitle: { fontFamily: F.body, fontSize: 14, color: C.muted, marginBottom: 24 },
  sectionHeader: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink, marginTop: 24, marginBottom: 4 },
  socialHint: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 12 },
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft, marginTop: 14, marginBottom: 5 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card,
  },
  multiline: { height: 90, textAlignVertical: 'top' },
  connectCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.accentTint, borderRadius: R.md, padding: 13,
    borderWidth: 1.5, borderColor: C.accentSoft,
  },
  connectCardTitle: { flex: 1, fontFamily: F.bodyBold, fontSize: 15, color: C.ink },
  orText: { fontFamily: F.bodySemi, fontSize: 12.5, color: C.accent, textAlign: 'center', marginTop: 8, textDecorationLine: 'underline' },
  verifiedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.okSoft, borderRadius: R.md, padding: 13,
    borderWidth: 1.5, borderColor: C.ok,
  },
  verifiedHandle: { flex: 1, fontFamily: F.bodyBold, fontSize: 15, color: C.ink },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.card, borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedBadgeText: { fontFamily: F.bodySemi, fontSize: 10, color: C.ok },
  row: { flexDirection: 'row' },
  button: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 16, alignItems: 'center', marginTop: 28, marginBottom: 16, ...(S.button as any),
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  betaBox: {
    backgroundColor: C.accentTint, borderRadius: R.md, padding: 13,
    borderWidth: 1, borderColor: C.accentSoft, marginBottom: 6,
  },
  betaBoxText: { fontFamily: F.body, fontSize: 13, color: C.accent, lineHeight: 19 },
});
