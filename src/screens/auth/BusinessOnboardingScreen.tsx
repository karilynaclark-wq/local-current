import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AtInput from '../../components/AtInput';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';

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
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleStep1() {
    if (!fullName || !email || !password) {
      Alert.alert('Required', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    setStep(2);
  }

  async function handleSubmit() {
    if (!businessName) {
      Alert.alert('Required', 'Please enter your business name.');
      return;
    }
    setLoading(true);
    try {
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

      const { error: bizError } = await supabase.from('businesses').insert({
        profile_id: data.user.id,
        business_name: businessName.replace(/\b\w/g, c => c.toUpperCase()),
        website,
        description,
        instagram_handle: instagram,
        tiktok_handle: tiktok,
        subscription_tier: 'starter',
      });
      if (bizError) throw bizError;
      await supabase.auth.refreshSession();
    } catch (e: any) {
      if (e.message?.includes('profiles_pkey') || e.message?.includes('duplicate key')) {
        Alert.alert('Account already exists', 'This profile already exists — log in to access your account.');
      } else {
        Alert.alert('Error', e.message);
      }
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

              <TouchableOpacity style={styles.button} onPress={handleStep1}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setStep(1)} style={styles.back}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>

              <Text style={styles.title}>Tell us about your business</Text>
              <Text style={styles.subtitle}>This is what creators will see</Text>

              <Text style={styles.label}>Business name *</Text>
              <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Jo's Coffee" placeholderTextColor={C.muted2} />

              <Text style={styles.label}>Website</Text>
              <TextInput style={styles.input} value={website} onChangeText={setWebsite} placeholder="https://yourbusiness.com" placeholderTextColor={C.muted2} autoCapitalize="none" keyboardType="url" />

              <Text style={styles.label}>About</Text>
              <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Tell creators what makes your business special..." placeholderTextColor={C.muted2} multiline numberOfLines={3} />

              <Text style={styles.sectionHeader}>Social</Text>
              <Text style={styles.socialHint}>Make sure to include this if you want creators to tag you when they post about you!</Text>

              <Text style={styles.label}>Instagram handle</Text>
              <AtInput value={instagram} onChangeText={setInstagram} placeholder="yourbusiness" />

              <Text style={styles.label}>TikTok handle</Text>
              <AtInput value={tiktok} onChangeText={setTiktok} placeholder="yourbusiness" />

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
