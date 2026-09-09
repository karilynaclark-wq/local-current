import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { signIn } from '../../lib/auth';
import { trackEvent } from '../../lib/analytics';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

export default function SignInScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleForgotPassword() {
    if (!email) {
      Alert.alert('Enter your email', 'Type your email above and tap "Forgot password?" to receive a reset link.');
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      Alert.alert('Email sent', `Check your inbox at ${email} for a password reset link.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSignIn() {
    if (!email || !password) { Alert.alert('Missing fields', 'Enter your email and password.'); return; }
    setLoading(true);
    try {
      await signIn(email, password);
      trackEvent('signed_in');
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 24 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Icon name="back" size={20} color={C.accent} />
        </TouchableOpacity>

        <Text style={styles.title}>Welcome back</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.muted2} keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={C.muted2} secureTextEntry />

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignIn} disabled={loading} accessibilityLabel="Sign in" accessibilityRole="button">
            <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword} disabled={resetLoading}>
            <Text style={styles.forgotText}>{resetLoading ? 'Sending…' : 'Forgot password?'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  back: { marginBottom: 24 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 28, letterSpacing: -0.5, color: C.ink, marginBottom: 32 },
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
  forgotBtn: { alignItems: 'center', marginTop: 16 },
  forgotText: { fontFamily: F.bodySemi, color: C.accent, fontSize: 14 },
});
