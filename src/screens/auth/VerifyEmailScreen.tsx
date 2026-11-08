// Step after sign-up: enter the 6-digit code we emailed. Verifying signs the
// person in; then we create their profile and continue to onboarding.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/analytics';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

export default function VerifyEmailScreen() {
  const navigation = useNavigation<any>();
  const { email } = useRoute<any>().params as { email: string };
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify() {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) { Alert.alert('Enter the code', 'Type the 6-digit code from your email.'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error || !data.user) {
      setLoading(false);
      Alert.alert("That code didn't work", 'Check the code or tap "Send a new code".');
      return;
    }
    const meta = data.user.user_metadata ?? {};
    const role = meta.role === 'business' ? 'business' : 'creator';
    await supabase.from('profiles').upsert({ id: data.user.id, email, full_name: meta.full_name ?? '', role });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    trackEvent('email_verified', { role });
    setLoading(false);
    navigation.navigate(role === 'creator' ? 'CreatorOnboarding' : 'BusinessOnboarding');
  }

  async function resend() {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    Alert.alert(error ? 'Could not send' : 'Code sent', error ? error.message : `We sent a new code to ${email}.`);
  }

  return (
    <SafeAreaView style={st.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.inner}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.back}>
          <Icon name="back" size={20} color={C.accent} />
        </TouchableOpacity>
        <Text style={st.title}>Check your email</Text>
        <Text style={st.sub}>We sent a 6-digit code to <Text style={st.bold}>{email}</Text>. Enter it below to confirm it's you.</Text>
        <TextInput
          style={st.input}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={C.muted2}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
        />
        <TouchableOpacity style={[st.button, loading && { opacity: 0.6 }]} onPress={verify} disabled={loading}>
          <Text style={st.buttonText}>{loading ? 'Checking…' : 'Confirm email'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={resend} disabled={resending} style={st.link}>
          <Text style={st.linkText}>{resending ? 'Sending…' : 'Send a new code'}</Text>
        </TouchableOpacity>
        <Text style={st.fine}>Can't find it? Check your spam folder.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  inner: { flex: 1, padding: 28, paddingTop: 16 },
  back: { paddingVertical: 8, marginBottom: 16, alignSelf: 'flex-start' },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 28, letterSpacing: -0.5, color: C.ink, marginBottom: 10 },
  sub: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.inkSoft, marginBottom: 24 },
  bold: { fontFamily: F.bodySemi, color: C.ink },
  input: {
    fontFamily: F.display, fontSize: 28, letterSpacing: 8, textAlign: 'center', color: C.ink,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, paddingVertical: 14, backgroundColor: C.card,
  },
  button: { backgroundColor: C.accent, borderRadius: R.btn, padding: 16, alignItems: 'center', marginTop: 20, ...(S.button as any) },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  link: { alignItems: 'center', padding: 16 },
  linkText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent },
  fine: { fontFamily: F.body, fontSize: 12.5, color: C.muted2, textAlign: 'center' },
} as any);
