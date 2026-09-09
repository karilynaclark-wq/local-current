import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
  Image, ActivityIndicator,
} from 'react-native';
import AtInput from '../../components/AtInput';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';
import { Profile } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

const FOLLOWER_RANGES = ['Under 1K', '1K–5K', '5K–10K', '10K–50K', '50K–100K', '100K+'];

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<'creator' | 'business' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fullName, setFullName] = useState('');

  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [mainPlatform, setMainPlatform] = useState('');
  const [followerRange, setFollowerRange] = useState('');
  const [secondaryFollowerRange, setSecondaryFollowerRange] = useState('');
  const [followerChanged, setFollowerChanged] = useState(false);
  const [originalFollowerRange, setOriginalFollowerRange] = useState('');
  const [originalSecondaryFollowerRange, setOriginalSecondaryFollowerRange] = useState('');
  const [zipCode, setZipCode] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [bizInstagram, setBizInstagram] = useState('');
  const [bizTiktok, setBizTiktok] = useState('');

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile(prof);
    setRole(prof?.role);
    setAvatarUrl(prof?.avatar_url ?? null);
    setFullName(prof?.full_name ?? '');
    if (prof?.role === 'creator') {
      const { data: creator } = await supabase.from('creators').select('*').eq('profile_id', user.id).single();
      if (creator) {
        setInstagram(creator.instagram_handle ?? '');
        setTiktok(creator.tiktok_handle ?? '');
        setMainPlatform(creator.main_platform ?? '');
        setFollowerRange(creator.follower_range ?? '');
        setOriginalFollowerRange(creator.follower_range ?? '');
        setSecondaryFollowerRange(creator.secondary_follower_range ?? '');
        setOriginalSecondaryFollowerRange(creator.secondary_follower_range ?? '');
        setZipCode(creator.zip_code ?? '');
      }
    } else if (prof?.role === 'business') {
      const { data: biz } = await supabase.from('businesses').select('*').eq('profile_id', user.id).single();
      if (biz) {
        setBusinessName(biz.business_name ?? '');
        setWebsite(biz.website ?? '');
        setDescription(biz.description ?? '');
        setAddress(biz.address ?? '');
        setBizInstagram(biz.instagram_handle ?? '');
        setBizTiktok(biz.tiktok_handle ?? '');
      }
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id);
      if (role === 'creator') {
        const rangeChanged = followerRange !== originalFollowerRange || secondaryFollowerRange !== originalSecondaryFollowerRange;
        const updates: any = { instagram_handle: instagram, tiktok_handle: tiktok, zip_code: zipCode };
        if (rangeChanged) {
          updates.pending_follower_range = followerRange;
          updates.pending_secondary_follower_range = secondaryFollowerRange;
          Alert.alert('Verification required', 'Changing your follower count requires verification. Your account will show the current count until an admin has verified your change — usually within 24 hours.', [{ text: 'OK' }]);
        }
        const { error } = await supabase.from('creators').update(updates).eq('profile_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('businesses').update({
          business_name: businessName,
          website,
          description,
          address,
          instagram_handle: bizInstagram,
          tiktok_handle: bizTiktok,
        }).eq('profile_id', user.id);
        if (error) throw error;
      }
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickAndUploadAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const uri = result.assets[0].uri;
      const mimeType = result.assets[0].mimeType ?? 'image/jpeg';
      const ext = mimeType.split('/')[1] ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: dbError } = await supabase.from('profiles').update({ avatar_url: bustedUrl }).eq('id', user.id);
      if (dbError) throw dbError;
      setAvatarUrl(bustedUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  if (loading) return null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <TouchableOpacity onPress={signOut}>
              <Text style={styles.signOut}>Sign out</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.email}>{profile?.email}</Text>

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarContainer} onPress={pickAndUploadAvatar} activeOpacity={0.8}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="person" size={40} color={C.muted2} />
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Icon name="phone" size={12} color={C.card} />
            </View>
          </TouchableOpacity>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={C.muted2}
            autoCapitalize="words"
          />

          {role === 'creator' ? (
            <>
              {(['instagram', 'tiktok'] as const)
                .sort((a, b) => (a === mainPlatform ? -1 : b === mainPlatform ? 1 : 0))
                .map((platform, idx) => {
                  const isPrimary = platform === mainPlatform;
                  const isInstagram = platform === 'instagram';
                  const handle = isInstagram ? instagram : tiktok;
                  const setHandle = isInstagram ? setInstagram : setTiktok;
                  const range = isPrimary ? followerRange : secondaryFollowerRange;
                  const setRange = isPrimary
                    ? (r: string) => { setFollowerRange(r); setFollowerChanged(true); }
                    : (r: string) => { setSecondaryFollowerRange(r); setFollowerChanged(true); };

                  return (
                    <View key={platform} style={idx > 0 ? { marginTop: 20 } : {}}>
                      <View style={styles.platformHeader}>
                        <Icon name={isInstagram ? 'film' : 'phone'} size={16} color={C.accent} />
                        <Text style={styles.platformTitle}>{isInstagram ? 'Instagram' : 'TikTok'}</Text>
                        <View style={[styles.platformBadge, isPrimary ? styles.primaryBadge : styles.secondaryBadge]}>
                          <Text style={[styles.platformBadgeText, isPrimary ? styles.primaryBadgeText : styles.secondaryBadgeText]}>
                            {isPrimary ? 'Primary' : 'Secondary'}
                          </Text>
                        </View>
                      </View>
                      <AtInput value={handle} onChangeText={setHandle} />
                      <Text style={styles.hint}>Followers · changing requires re-approval</Text>
                      <View style={styles.chipRow}>
                        {FOLLOWER_RANGES.map(r => (
                          <TouchableOpacity key={r} style={[styles.chip, range === r && styles.chipSelected]} onPress={() => setRange(r)}>
                            <Text style={[styles.chipText, range === r && styles.chipTextSelected]}>{r}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}

              {followerChanged && (
                <View style={styles.warningBox}>
                  <Icon name="bell" size={14} color="#92400E" />
                  <Text style={styles.warningText}>Your requested change will be reviewed by an admin. Your current approved count stays active in the meantime.</Text>
                </View>
              )}

              <Text style={[styles.label, { marginTop: 20 }]}>Zip code</Text>
              <TextInput
                style={styles.input}
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="e.g. 60614"
                placeholderTextColor={C.muted2}
                keyboardType="number-pad"
                maxLength={5}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Business name</Text>
              <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Business name" placeholderTextColor={C.muted2} />

              <Text style={styles.label}>Website</Text>
              <TextInput style={styles.input} value={website} onChangeText={setWebsite} placeholder="https://" placeholderTextColor={C.muted2} autoCapitalize="none" keyboardType="url" />

              <Text style={styles.label}>About</Text>
              <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="About your business" placeholderTextColor={C.muted2} multiline numberOfLines={3} />

              <Text style={styles.label}>Address</Text>
              <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="123 Main St, Chicago, IL 60601" placeholderTextColor={C.muted2} />

              <Text style={styles.sectionHeader}>Social</Text>

              <Text style={styles.label}>Instagram handle</Text>
              <AtInput value={bizInstagram} onChangeText={setBizInstagram} placeholder="yourbusiness" />

              <Text style={styles.label}>TikTok handle</Text>
              <AtInput value={bizTiktok} onChangeText={setBizTiktok} placeholder="yourbusiness" />
            </>
          )}

          <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  scroll: { padding: 24, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, letterSpacing: -0.4, color: C.ink },
  signOut: { fontFamily: F.body, color: C.muted2, fontSize: 14 },
  email: { fontFamily: F.mono, fontSize: 12, color: C.accent, letterSpacing: 0.3, marginBottom: 24 },
  sectionHeader: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink, marginTop: 24, marginBottom: 4 },
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft, marginTop: 16, marginBottom: 6 },
  hint: { fontFamily: F.body, fontSize: 12, color: C.muted2, marginTop: -2, marginBottom: 8 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card,
  },
  multiline: { height: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card },
  chipSelected: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.muted },
  chipTextSelected: { fontFamily: F.bodySemi, color: '#fff' },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7', borderRadius: R.md, padding: 12, marginTop: 8,
  },
  warningText: { fontFamily: F.body, flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  platformHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  platformTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink },
  platformBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm },
  primaryBadge: { backgroundColor: C.accentTint },
  secondaryBadge: { backgroundColor: C.line },
  platformBadgeText: { fontFamily: F.monoBold, fontSize: 11 },
  primaryBadgeText: { color: C.accent },
  secondaryBadgeText: { color: C.muted2 },
  button: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 16, alignItems: 'center', marginTop: 32, ...(S.button as any),
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  avatarContainer: { alignSelf: 'center', marginBottom: 24, width: 90, height: 90, borderRadius: 45 },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 45, alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: C.muted2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.card,
  },
} as any);
