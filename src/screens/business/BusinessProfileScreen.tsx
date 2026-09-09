import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, RefreshControl, Image, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';
import { Icon, Mark, SocialIcon } from '../../components/Icon';
import { StatusChip } from '../../components/UI';

const ZIP_TO_NEIGHBORHOOD: Record<string, string> = {
  '60601': 'The Loop', '60602': 'The Loop', '60603': 'The Loop', '60604': 'The Loop',
  '60605': 'South Loop', '60606': 'The Loop', '60607': 'West Loop', '60608': 'Pilsen',
  '60609': 'Back of the Yards', '60610': 'Gold Coast', '60611': 'Streeterville',
  '60612': 'West Garfield Park', '60613': 'Lakeview', '60614': 'Lincoln Park',
  '60615': 'Hyde Park', '60616': 'Chinatown', '60617': 'South Chicago',
  '60618': 'Irving Park', '60619': 'Chatham', '60620': 'Auburn Gresham',
  '60621': 'Englewood', '60622': 'Wicker Park', '60623': 'Little Village',
  '60624': 'Garfield Park', '60625': 'Albany Park', '60626': 'Rogers Park',
  '60628': 'Roseland', '60629': 'Chicago Lawn', '60630': 'Jefferson Park',
  '60631': 'Norwood Park', '60632': 'Brighton Park', '60633': 'Hegewisch',
  '60634': 'Dunning', '60636': 'West Englewood', '60637': 'Woodlawn',
  '60638': 'Garfield Ridge', '60639': 'Belmont Cragin', '60640': 'Uptown',
  '60641': 'Hermosa', '60642': 'River North', '60643': 'Morgan Park',
  '60644': 'Austin', '60645': 'West Rogers Park', '60646': 'Norwood Park',
  '60647': 'Logan Square', '60649': 'South Shore', '60651': 'Humboldt Park',
  '60652': 'Ashburn', '60653': 'Bronzeville', '60654': 'River North',
  '60655': 'Mount Greenwood', '60656': 'Norwood Park', '60657': 'Lakeview',
  '60659': 'West Ridge', '60660': 'Edgewater', '60661': 'West Loop',
};

function neighborhoodFromAddress(address?: string): string | null {
  if (!address) return null;
  const match = address.match(/\b(606\d{2})\b/);
  return match ? (ZIP_TO_NEIGHBORHOOD[match[1]] ?? null) : null;
}

export default function BusinessProfileScreen() {
  const navigation = useNavigation<any>();
  const [business, setBusiness] = useState<any>(null);
  const [circuits, setCircuits] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'circuits' | 'reviews'>('circuits');
  const [reviews, setReviews] = useState<any[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadError(false);
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRefreshing(false); return; }
    setUserId(user.id);

    const { data: prof } = await supabase.from('profiles').select('avatar_url, full_name').eq('id', user.id).single();
    const { data: biz } = await supabase.from('businesses').select('*').eq('profile_id', user.id).single();

    if (biz) {
      setBusiness({ ...biz, avatar_url: prof?.avatar_url ?? null, full_name: prof?.full_name ?? biz.business_name });

      const { data: bizCircuits } = await supabase
        .from('circuits')
        .select('id, title, is_active, created_at, redemptions(id)')
        .eq('business_id', biz.id)
        .order('created_at', { ascending: false });
      const sorted = (bizCircuits ?? []).sort((a: any, b: any) => {
        const rank = (c: any) => c.is_active ? 0 : (c.redemptions?.length ?? 0) > 0 ? 2 : 1;
        return rank(a) - rank(b);
      });
      setCircuits(sorted);

      const { data: redemptionRows } = await supabase
        .from('redemptions')
        .select('id, creator_id, circuit:circuits(title)')
        .in('circuit_id', (bizCircuits ?? []).map((c: any) => c.id));

      const redemptionIds = (redemptionRows ?? []).map((r: any) => r.id);
      const creatorIds = [...new Set((redemptionRows ?? []).map((r: any) => r.creator_id).filter(Boolean))];

      const { data: creatorRows } = creatorIds.length > 0
        ? await supabase.from('creators').select('id, profile:profiles(full_name)').in('id', creatorIds)
        : { data: [] as any[] };

      const creatorById: Record<string, any> = {};
      (creatorRows ?? []).forEach((c: any) => { creatorById[c.id] = c; });

      const redemptionMetaMap: Record<string, { title: string; creatorId: string | null; creatorName: string | null }> = {};
      (redemptionRows ?? []).forEach((r: any) => {
        const creator = r.creator_id ? creatorById[r.creator_id] : null;
        redemptionMetaMap[r.id] = {
          title: r.circuit?.title ?? '',
          creatorId: r.creator_id ?? null,
          creatorName: creator?.profile?.full_name ?? null,
        };
      });

      if (redemptionIds.length > 0) {
        const { data: feedbackRows } = await supabase
          .from('redemption_feedback')
          .select('rating, public_feedback, created_at, redemption_id')
          .in('redemption_id', redemptionIds)
          .order('created_at', { ascending: false });

        setReviews(
          (feedbackRows ?? [])
            .filter((f: any) => f.rating || f.public_feedback)
            .map((f: any) => ({
              ...f,
              circuit_title: redemptionMetaMap[f.redemption_id]?.title ?? '',
              creator_id: redemptionMetaMap[f.redemption_id]?.creatorId ?? null,
              creator_name: redemptionMetaMap[f.redemption_id]?.creatorName ?? null,
            }))
        );
      }
    }
    } catch (e: any) {
      setLoadError(true);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  async function pickAndUploadAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photo library.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingAvatar(true);
    try {
      const uri = result.assets[0].uri;
      const mimeType = result.assets[0].mimeType ?? 'image/jpeg';
      const ext = mimeType.split('/')[1] ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: bustedUrl }).eq('id', userId);
      setBusiness((prev: any) => prev ? { ...prev, avatar_url: bustedUrl } : prev);
      Alert.alert('Done', 'Profile photo updated.');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  const neighborhood = neighborhoodFromAddress(business?.address);

  return (
    <SafeAreaView style={styles.container}>
      {loadError && (
        <TouchableOpacity style={styles.errorBanner} onPress={load} activeOpacity={0.8}>
          <Text style={styles.errorBannerText}>Could not load profile. Tap to retry.</Text>
        </TouchableOpacity>
      )}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
          <Icon name="gear" size={20} color={C.muted2} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.accent} />} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <TouchableOpacity style={styles.avatarCircle} onPress={pickAndUploadAvatar} activeOpacity={0.8}>
              {business?.avatar_url ? (
                <Image source={{ uri: business.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Icon name="storefront" size={32} color={C.muted2} />
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Icon name="phone" size={11} color={C.card} />
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <Text style={styles.name}>{business?.business_name ?? '—'}</Text>
              {neighborhood && (
                <View style={styles.locationRow}>
                  <Icon name="pin" size={13} color={C.accent} />
                  <Text style={styles.locationText}>{neighborhood}</Text>
                </View>
              )}
              {business?.website && (
                <TouchableOpacity onPress={() => Linking.openURL(business.website)}>
                  <View style={styles.linkRow}>
                    <Icon name="link" size={13} color={C.muted2} />
                    <Text style={styles.websiteText} numberOfLines={1}>{business.website.replace(/^https?:\/\//, '')}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.socialRow}>
            {business?.instagram_handle ? (
              <TouchableOpacity style={styles.socialPill} onPress={() => Linking.openURL(`https://www.instagram.com/${business.instagram_handle.replace('@', '')}`)} activeOpacity={0.7}>
                <SocialIcon kind="ig" size={16} color={C.ink} />
                <Text style={styles.socialPillText}>@{business.instagram_handle.replace('@', '')}</Text>
              </TouchableOpacity>
            ) : null}
            {business?.tiktok_handle ? (
              <TouchableOpacity style={styles.socialPill} onPress={() => Linking.openURL(`https://www.tiktok.com/@${business.tiktok_handle.replace('@', '')}`)} activeOpacity={0.7}>
                <SocialIcon kind="tt" size={16} color={C.ink} />
                <Text style={styles.socialPillText}>@{business.tiktok_handle.replace('@', '')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity style={[styles.tab, activeTab === 'circuits' && styles.tabActive]} onPress={() => setActiveTab('circuits')}>
            <Mark size={14} color={activeTab === 'circuits' ? '#fff' : C.muted2} />
            <Text style={[styles.tabText, activeTab === 'circuits' && styles.tabTextActive]}>Currents</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'reviews' && styles.tabActive]} onPress={() => setActiveTab('reviews')}>
            <Icon name="star" size={14} color={activeTab === 'reviews' ? '#fff' : C.muted2} />
            <Text style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]}>Reviews</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'circuits' ? (
          <View style={styles.gridContainer}>
            {circuits.length === 0 ? (
              <View style={styles.emptyBox}>
                <Icon name="sparkles" size={32} color={C.muted2} />
                <Text style={styles.emptyTitle}>No currents yet</Text>
                <Text style={styles.emptySubtitle}>Post a current and it'll show up here</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {circuits.map((item) => {
                  const hasRedemptions = (item.redemptions?.length ?? 0) > 0;
                  const isCompleted = !item.is_active && hasRedemptions;
                  const status = item.is_active ? 'active' : isCompleted ? 'completed' : 'inactive';
                  const cardBg = status === 'active' ? C.okSoft : status === 'completed' ? C.claimedBg : C.accentTint;
                  return (
                    <TouchableOpacity key={item.id} style={[styles.gridCard, { backgroundColor: cardBg, borderColor: 'transparent' }]} onPress={() => navigation.navigate('BusinessCircuitDetail', { circuit: item })} activeOpacity={0.8}>
                      <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
                      <StatusChip status={status as any} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.reviewsContainer}>
            {reviews.length === 0 ? (
              <View style={styles.emptyBox}>
                <Icon name="star" size={32} color={C.muted2} />
                <Text style={styles.emptyTitle}>No reviews yet</Text>
                <Text style={styles.emptySubtitle}>Reviews from creators will appear here</Text>
              </View>
            ) : (
              reviews.map((r: any, i: number) => (
                <View key={i} style={styles.reviewCard}>
                  {r.rating ? (
                    <View style={styles.ratingRow}>
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Icon key={si} name={si < r.rating ? 'star-fill' : 'star'} size={16} color="#C39A3A" />
                      ))}
                    </View>
                  ) : null}
                  {r.public_feedback ? <Text style={styles.reviewText}>"{r.public_feedback}"</Text> : null}
                  <View style={styles.reviewFooter}>
                    {r.creator_id ? (
                      <TouchableOpacity onPress={() => navigation.navigate('CreatorPublicProfile', { creatorId: r.creator_id })} activeOpacity={0.7}>
                        <Text style={styles.reviewCreator}>{r.creator_name ?? 'Creator'}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <Text style={styles.reviewMeta}>
                      {r.circuit_title ? `${r.circuit_title} · ` : ''}{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  errorBanner: { backgroundColor: '#FEF2F2', borderBottomWidth: 1, borderBottomColor: '#FECACA', paddingHorizontal: 16, paddingVertical: 12 },
  errorBannerText: { fontFamily: F.bodyMedium, fontSize: 13, color: '#DC2626', textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  settingsBtn: { padding: 8 },
  profileCard: {
    backgroundColor: C.card, marginHorizontal: 16, marginTop: 8,
    borderRadius: R.lg, padding: 20, borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  profileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, position: 'relative' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 40, alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.muted2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.card,
  },
  profileInfo: { flex: 1, paddingTop: 4 },
  name: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink, marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  locationText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.muted },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  websiteText: { fontFamily: F.body, fontSize: 12, color: C.muted },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  socialPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: R.pill,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.paper,
  },
  socialPillText: { fontFamily: F.bodySemi, fontSize: 13, color: C.ink },
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 16,
    backgroundColor: C.card, borderRadius: R.md, padding: 4, borderWidth: 1, borderColor: C.line,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: R.sm, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabActive: { backgroundColor: C.ink },
  tabText: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted2 },
  tabTextActive: { color: '#fff' },
  gridContainer: { padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCard: {
    width: '47%', backgroundColor: C.card, borderRadius: R.lg, padding: 14, minHeight: 110,
    justifyContent: 'space-between', borderWidth: 1, borderColor: C.line,
  },
  gridTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 14, color: C.ink, marginBottom: 10 },
  reviewsContainer: { padding: 16, gap: 12 },
  reviewCard: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 16,
    borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  ratingRow: { flexDirection: 'row', gap: 2, marginBottom: 6 },
  reviewText: { fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 21, fontStyle: 'italic', marginBottom: 8 },
  reviewFooter: { gap: 2 },
  reviewCreator: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent, textDecorationLine: 'underline', marginBottom: 2 },
  reviewMeta: { fontFamily: F.mono, fontSize: 11, color: C.muted2, letterSpacing: 0.4 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.ink },
  emptySubtitle: { fontFamily: F.body, fontSize: 13, color: C.muted, textAlign: 'center' },
} as any);
