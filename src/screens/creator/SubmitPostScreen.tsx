import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Redemption } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon, SocialIcon } from '../../components/Icon';
import { getPushToken, sendPush } from '../../lib/notifications';
import { trackEvent } from '../../lib/analytics';

export default function SubmitPostScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const redemption: Redemption = route.params.redemption;

  const requiredPlatform: string | null = (redemption as any).circuit?.required_platform ?? null;

  const [tiktokUrl, setTiktokUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [loading, setLoading] = useState(false);

  function isValidTikTokUrl(url: string) {
    return /^https?:\/\/(www\.|vm\.)?tiktok\.com\/.+/i.test(url.trim());
  }

  function isValidInstagramUrl(url: string) {
    return /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/.+/i.test(url.trim());
  }

  async function handleSubmit() {
    if (!tiktokUrl && !instagramUrl) {
      Alert.alert('Required', 'Please paste at least one post URL.');
      return;
    }
    if (requiredPlatform === 'tiktok' && !tiktokUrl) {
      Alert.alert('TikTok required', 'This current requires a TikTok post. Please add your TikTok link.');
      return;
    }
    if (requiredPlatform === 'instagram' && !instagramUrl) {
      Alert.alert('Instagram required', 'This current requires an Instagram post. Please add your Instagram link.');
      return;
    }
    if (tiktokUrl && !isValidTikTokUrl(tiktokUrl)) {
      Alert.alert('Invalid link', 'That doesn\'t look like a valid TikTok URL. Make sure it starts with https://www.tiktok.com/...');
      return;
    }
    if (instagramUrl && !isValidInstagramUrl(instagramUrl)) {
      Alert.alert('Invalid link', 'That doesn\'t look like a valid Instagram post URL. It should look like https://www.instagram.com/reel/...');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: creator } = await supabase.from('creators').select('id').eq('profile_id', user.id).single();
      if (!creator) throw new Error('Creator not found');

      const posts = [
        tiktokUrl ? { platform: 'tiktok', video_url: tiktokUrl } : null,
        instagramUrl ? { platform: 'instagram', video_url: instagramUrl } : null,
      ].filter(Boolean);

      for (const post of posts) {
        const { error } = await supabase.from('posts').insert({
          redemption_id: redemption.id,
          creator_id: creator.id,
          business_id: redemption.circuit?.business?.id,
          video_url: post!.video_url,
          platform: post!.platform,
        });
        if (error) throw error;
      }

      await supabase.from('redemptions').update({ status: 'completed' }).eq('id', redemption.id);

      // Notify the business that a post was submitted
      const businessProfileId = redemption.circuit?.business?.profile_id;
      if (businessProfileId) {
        const token = await getPushToken(businessProfileId);
        if (token) {
          const platforms = posts.map(p => p!.platform === 'tiktok' ? 'TikTok' : 'Instagram').join(' & ');
          sendPush(token, 'New post submitted! 📱', `A creator posted to ${platforms} for your "${redemption.circuit?.title}" current`);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent('post_submitted', {
        redemption_id: redemption.id,
        circuit_title: redemption.circuit?.title,
        platforms: posts.map(p => p!.platform),
        platform_count: posts.length,
      });
      navigation.replace('PostSubmitted', {
        redemptionId: redemption.id,
        businessName: redemption.circuit?.business?.business_name,
      });
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Icon name="back" size={20} color={C.accent} />
          </TouchableOpacity>

          <Text style={styles.title}>Submit your post</Text>
          <Text style={styles.subtitle}>For: {redemption.circuit?.title}</Text>
          <Text style={styles.hint}>
            {requiredPlatform
              ? `You must post to ${requiredPlatform === 'tiktok' ? 'TikTok' : 'Instagram'} for this current. The other platform is optional.`
              : 'Paste the link(s) to your post below. At least one is required.'}
          </Text>

          {/* TikTok */}
          <View style={styles.fieldGroup}>
            <View style={styles.platformLabel}>
              <SocialIcon kind="tt" size={18} color={C.ink} />
              <Text style={styles.platformName}>TikTok</Text>
              {requiredPlatform === 'tiktok' && <View style={styles.reqBadge}><Text style={styles.reqBadgeText}>Required</Text></View>}
              {requiredPlatform === 'instagram' && <Text style={styles.optionalText}>Optional</Text>}
            </View>
            <TextInput
              style={styles.input}
              value={tiktokUrl}
              onChangeText={setTiktokUrl}
              placeholder="https://www.tiktok.com/@you/video/..."
              placeholderTextColor={C.muted2}
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
            />
          </View>

          {/* Instagram */}
          <View style={styles.fieldGroup}>
            <View style={styles.platformLabel}>
              <SocialIcon kind="ig" size={18} color={C.ink} />
              <Text style={styles.platformName}>Instagram</Text>
              {requiredPlatform === 'instagram' && <View style={styles.reqBadge}><Text style={styles.reqBadgeText}>Required</Text></View>}
              {requiredPlatform === 'tiktok' && <Text style={styles.optionalText}>Optional</Text>}
            </View>
            <TextInput
              style={styles.input}
              value={instagramUrl}
              onChangeText={setInstagramUrl}
              placeholder="https://www.instagram.com/reel/..."
              placeholderTextColor={C.muted2}
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading} accessibilityLabel="Submit post" accessibilityRole="button">
            <Text style={styles.buttonText}>{loading ? 'Submitting…' : 'Submit post'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  scroll: { padding: 24, paddingBottom: 40 },
  back: { marginBottom: 24 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, letterSpacing: -0.4, color: C.ink, marginBottom: 4 },
  subtitle: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent, marginBottom: 8 },
  hint: { fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 28, lineHeight: 18 },
  fieldGroup: { marginBottom: 24 },
  platformLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  platformName: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  reqBadge: { backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  reqBadgeText: { fontFamily: F.monoBold, fontSize: 10, color: '#fff', letterSpacing: 0.4 },
  optionalText: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 14, fontSize: 14, color: C.ink, backgroundColor: C.card,
  },
  button: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 16, alignItems: 'center', marginTop: 8, ...(S.button as any),
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
});
