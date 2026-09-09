import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { signUp } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/analytics';
import { UserRole } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

export default function SignUpScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const role: UserRole = route.params?.role ?? 'creator';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToAuthority, setAgreedToAuthority] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!fullName || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Required', 'Please agree to the Terms of Use and Privacy Policy.');
      return;
    }
    if (role === 'business' && !agreedToAuthority) {
      Alert.alert('Required', 'Please confirm you are authorized to represent this business.');
      return;
    }
    setLoading(true);
    try {
      const data = await signUp(email, password, fullName, role);
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent('signed_up', { role });
      navigation.navigate(role === 'creator' ? 'CreatorOnboarding' : 'BusinessOnboarding');
    } catch (e: any) {
      if (e.message?.includes('profiles_pkey') || e.message?.includes('duplicate key')) {
        Alert.alert('Account already exists', 'This profile already exists — log in to access your account.');
      } else {
        Alert.alert('Error', e.message);
      }
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Icon name="back" size={20} color={C.accent} />
          </TouchableOpacity>

          <Text style={styles.title}>Create your account</Text>
          <View style={styles.roleTag}>
            <Icon name={role === 'creator' ? 'film' : 'storefront'} size={14} color={C.accent} />
            <Text style={styles.roleTagText}>{role === 'creator' ? 'Creator' : 'Business'}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Full name</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Jane Smith" placeholderTextColor={C.muted2} autoCapitalize="words" />

            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.muted2} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Min. 8 characters" placeholderTextColor={C.muted2} secureTextEntry />

            <TouchableOpacity style={styles.checkRow} onPress={() => setAgreedToTerms(v => !v)} activeOpacity={0.7}>
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>
                I have read and agree to the Local Current{' '}
                <Text style={styles.link} onPress={() => Linking.openURL('https://local-collab-flow.lovable.app/terms')}>Terms of Use</Text>
                {' '}and{' '}
                <Text style={styles.link} onPress={() => Linking.openURL('https://local-collab-flow.lovable.app/privacy')}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>

            {role === 'business' && (
              <TouchableOpacity style={styles.checkRow} onPress={() => setAgreedToAuthority(v => !v)} activeOpacity={0.7}>
                <View style={[styles.checkbox, agreedToAuthority && styles.checkboxChecked]}>
                  {agreedToAuthority && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>
                  I represent that I am authorized to create opportunities and make offers on behalf of this business and to bind the business to any commitments made through Local Current.
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignUp} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Continue'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  scroll: { padding: 24 },
  back: { marginBottom: 24 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 28, letterSpacing: -0.5, color: C.ink, marginBottom: 10 },
  roleTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  roleTagText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  form: { gap: 8 },
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft, marginTop: 8 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 14, fontSize: 15, color: C.ink, backgroundColor: C.card,
  },
  button: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 16, alignItems: 'center', marginTop: 24, ...(S.button as any),
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  betaBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.accentTint, borderRadius: R.md, padding: 14,
    borderWidth: 1, borderColor: C.accentSoft, marginBottom: 24,
  },
  betaBoxText: { fontFamily: F.body, fontSize: 13.5, color: C.accent, flex: 1, lineHeight: 19 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: C.line2,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkLabel: { fontFamily: F.body, fontSize: 13, color: C.inkSoft, flex: 1, lineHeight: 19 },
  link: { color: C.accent, textDecorationLine: 'underline' },
});
