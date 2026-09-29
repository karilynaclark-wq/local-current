import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, Alert, Modal, ActivityIndicator, TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

interface MenuItem {
  iconName: any;
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
  chevron?: boolean;
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'reauth'>('confirm');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  async function handleResetPassword() {
    setResettingPassword(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No email found');
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      Alert.alert('Email sent', `We sent a password reset link to ${user.email}. Check your inbox.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setResettingPassword(false);
    }
  }

  function sendFeedback() {
    Linking.openURL('mailto:hello@localcurrentapp.com?subject=Help%20Local%20Current%20Improve');
  }

  async function handleDeleteAccount() {
    if (!deletePassword) {
      Alert.alert('Required', 'Please enter your password to confirm.');
      return;
    }
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Could not identify your account');
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (signInError) {
        Alert.alert('Incorrect password', 'The password you entered is wrong. Please try again.');
        setDeleting(false);
        return;
      }
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await signOut();
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setDeleting(false);
      setDeleteModalVisible(false);
    }
  }

  const sections: { title?: string; items: MenuItem[] }[] = [
    {
      items: [
        { iconName: 'person', label: 'Edit Profile', chevron: true, onPress: () => navigation.navigate('EditProfile') },
        { iconName: 'gear', label: resettingPassword ? 'Sending…' : 'Reset Password', sublabel: "We'll email you a reset link", onPress: handleResetPassword },
        { iconName: 'bell', label: 'Send Feedback', sublabel: 'hello@localcurrentapp.com', chevron: true, onPress: sendFeedback },
      ],
    },
    {
      items: [
        { iconName: 'clipboard', label: 'Privacy Policy', chevron: true, onPress: () => Linking.openURL('https://local-collab-flow.lovable.app/privacy') },
        { iconName: 'clipboard', label: 'Terms of Use', chevron: true, onPress: () => Linking.openURL('https://local-collab-flow.lovable.app/terms') },
      ],
    },
    {
      items: [
        { iconName: 'logout', label: 'Log Out', onPress: signOut },
      ],
    },
    {
      items: [
        { iconName: 'close', label: 'Delete Account', sublabel: 'Permanently remove your account and data', destructive: true, onPress: () => setDeleteModalVisible(true) },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            {section.title && <Text style={styles.sectionTitle}>{section.title}</Text>}
            <View style={styles.card}>
              {section.items.map((item, ii) => (
                <React.Fragment key={ii}>
                  {ii > 0 && <View style={styles.divider} />}
                  <TouchableOpacity style={styles.row} onPress={item.onPress} activeOpacity={0.6}>
                    <View style={styles.iconBox}>
                      <Icon name={item.iconName} size={17} color={item.destructive ? '#EF4444' : C.muted} />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={[styles.label, item.destructive && styles.labelDestructive]}>{item.label}</Text>
                      {item.sublabel && <Text style={styles.sublabel}>{item.sublabel}</Text>}
                    </View>
                    {item.chevron && <Icon name="arrow" size={16} color={C.muted2} />}
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setDeleteModalVisible(false); setDeletePassword(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Icon name="close" size={32} color="#EF4444" />
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalBody}>
              This permanently deletes your account and cannot be undone. The following will be removed immediately:{'\n\n'}
              • Your profile and login{'\n'}
              • All requested and completed currents{'\n'}
              • Any posts you submitted{'\n'}
              • All ratings and feedback you gave or received
            </Text>
            <Text style={styles.passwordLabel}>Enter your password to confirm</Text>
            <TextInput
              style={styles.passwordInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Your password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.confirmBtn} onPress={handleDeleteAccount} disabled={deleting}>
              {deleting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Yes, delete my account</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.nevermindBtn} onPress={() => { setDeleteModalVisible(false); setDeletePassword(''); }} disabled={deleting}>
              <Text style={styles.nevermindBtnText}>Nevermind</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { fontFamily: F.display, fontWeight: '700', fontSize: 18, color: C.ink },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  section: { gap: 6 },
  sectionTitle: { fontFamily: F.mono, fontSize: 11, color: C.muted2, textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 4, marginBottom: 2 },
  card: {
    backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line,
    ...(S.card as any), overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: C.line, marginLeft: 60 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  iconBox: {
    width: 32, height: 32, borderRadius: R.sm,
    backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rowContent: { flex: 1 },
  label: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  labelDestructive: { color: '#EF4444' },
  sublabel: { fontFamily: F.body, fontSize: 12, color: C.muted2, marginTop: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(36,29,23,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 28,
    width: '100%', alignItems: 'center', ...(S.menu as any),
  },
  modalTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink, marginTop: 12, marginBottom: 10 },
  modalBody: { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  passwordLabel: { fontFamily: F.bodySemi, fontSize: 13, color: '#374151', alignSelf: 'flex-start', marginBottom: 6 },
  passwordInput: {
    width: '100%', borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: R.md,
    padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB', marginBottom: 20,
    fontFamily: F.body,
  },
  confirmBtn: {
    backgroundColor: '#EF4444', borderRadius: R.btn,
    paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  confirmBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: '#fff' },
  nevermindBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  nevermindBtnText: { fontFamily: F.bodySemi, color: C.muted, fontSize: 15 },
} as any);
