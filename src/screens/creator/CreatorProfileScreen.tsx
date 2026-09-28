import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, RefreshControl, Image, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';
import { Icon, Mark, SocialIcon } from '../../components/Icon';
import {
  getConnections, connectTikTok, syncTikTok, disconnectTikTok,
  connectInstagram, syncInstagram, disconnectInstagram, saveManualConnection,
  type SocialConnection, type Platform, type ConnectResult,
} from '../../lib/socialConnect';
import { ConnectedAccountRow, ConnectButton, ManualEntrySheet } from '../../components/SocialAccounts';

const PLATFORM_API: Record<Platform, {
  label: string;
  connect: () => Promise<ConnectResult>;
  sync: () => Promise<void>;
  disconnect: () => Promise<void>;
}> = {
  tiktok: { label: 'TikTok', connect: connectTikTok, sync: syncTikTok, disconnect: disconnectTikTok },
  instagram: { label: 'Instagram', connect: connectInstagram, sync: syncInstagram, disconnect: disconnectInstagram },
};

interface CreatorData {
  full_name: string;
  city: string;
  zip_code: string;
  instagram_handle: string;
  tiktok_handle: string;
  follower_range: string;
  avg_rating: number;
  rating_count: number;
  avatar_url: string | null;
}

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

interface CompletedCircuit {
  id: string;
  title: string;
  business_name: string;
  posts?: any[];
}

interface BusinessReview {
  id: string;
  business_rating: number;
  business_public_review: string | null;
  business_rated_at: string;
  circuit_title: string;
  business_name: string;
}

export default function CreatorProfileScreen() {
  const navigation = useNavigation<any>();
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [completed, setCompleted] = useState<CompletedCircuit[]>([]);
  const [reviews, setReviews] = useState<BusinessReview[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'circuits' | 'reviews'>('circuits');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<CompletedCircuit | null>(null);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [manualFor, setManualFor] = useState<Platform | null>(null);

  // Verified (OAuth) accounts replace the manual handle/range from sign-up.
  const isVerified = (p: Platform) =>
    connections.some(c => c.platform === p && c.connection_type === 'oauth');

  async function handleConnect(platform: Platform) {
    const { label, connect } = PLATFORM_API[platform];
    setConnecting(platform);
    try {
      const result = await connect();
      if (result === 'success') {
        setConnections(await getConnections());
        Alert.alert('Connected', `Your ${label} account is now linked.`);
      } else if (result === 'account_type') {
        Alert.alert(
          'Personal account',
          'Instagram only lets Business or Creator accounts connect. Switch to a professional account in Instagram settings, or add your details manually.',
          [{ text: 'OK' }, { text: 'Add manually', onPress: () => setManualFor(platform) }],
        );
      } else if (result === 'not_configured') {
        Alert.alert('Coming soon', `${label} connection isn't available yet. You can add your details manually for now.`);
      } else if (result === 'error') {
        Alert.alert('Could not connect', `${label} connection failed. Please try again.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setConnecting(null);
    }
  }

  function handleDisconnect(platform: Platform) {
    const { label, disconnect } = PLATFORM_API[platform];
    Alert.alert(`Disconnect ${label}`, `Remove your linked ${label} account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          await disconnect();
          setConnections(await getConnections());
        },
      },
    ]);
  }

  async function handleManualSave(handle: string, followers: number) {
    if (!manualFor) return;
    await saveManualConnection(manualFor, handle, followers);
    setConnections(await getConnections());
  }

  const load = useCallback(async (resync = false) => {
    setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRefreshing(false); return; }
    setUserId(user.id);

    const [{ data: prof }, { data: cr }] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url, role').eq('id', user.id).single(),
      supabase.from('creators').select('*').eq('profile_id', user.id).single(),
    ]);

    setViewerRole(prof?.role ?? null);

    try {
      const conns = await getConnections();
      setConnections(conns);
      // Re-pull verified stats in the background, then refresh the rows.
      const verified = conns.filter(c => c.connection_type === 'oauth');
      if (resync && verified.length) {
        Promise.all(verified.map(c => PLATFORM_API[c.platform].sync()))
          .then(async () => setConnections(await getConnections()))
          .catch(() => { /* stale stats are fine; daily cron catches up */ });
      }
    } catch (_) { /* table may be empty */ }

    if (cr) {
      const { data: ratings } = await supabase.from('redemptions').select('business_rating').eq('creator_id', cr.id).not('business_rating', 'is', null);
      const ratingCount = ratings?.length ?? 0;
      const avgRating = ratingCount > 0
        ? ratings!.reduce((s: number, r: any) => s + (r.business_rating ?? 0), 0) / ratingCount
        : 0;

      setCreator({
        full_name: prof?.full_name ?? user.email?.split('@')[0] ?? 'Creator',
        city: cr.city ?? '',
        zip_code: cr.zip_code ?? '',
        instagram_handle: cr.instagram_handle ?? '',
        tiktok_handle: cr.tiktok_handle ?? '',
        follower_range: cr.follower_range ?? '',
        avg_rating: avgRating,
        rating_count: ratingCount,
        avatar_url: prof?.avatar_url ?? null,
      });

      // Fetch completed redemptions and posts separately to avoid RLS join issues
      const { data: redemptions } = await supabase
        .from('redemptions')
        .select('id, status, business_rating, business_public_review, business_rated_at, circuit:circuits(title, business:businesses(business_name))')
        .eq('creator_id', cr.id)
        .eq('status', 'completed')
        .order('id', { ascending: false });

      const redemptionIds = (redemptions ?? []).map((r: any) => r.id);
      let postsByRedemption: Record<string, any[]> = {};
      if (redemptionIds.length > 0) {
        const { data: posts } = await supabase
          .from('posts')
          .select('redemption_id, platform, video_url, views, likes, comments, submitted_at')
          .in('redemption_id', redemptionIds);
        for (const p of (posts ?? [])) {
          if (!postsByRedemption[p.redemption_id]) postsByRedemption[p.redemption_id] = [];
          postsByRedemption[p.redemption_id].push(p);
        }
      }

      const doneRedemptions = redemptions ?? [];

      setCompleted(doneRedemptions.map((r: any) => ({
        id: r.id,
        title: r.circuit?.title ?? 'Circuit',
        business_name: r.circuit?.business?.business_name ?? '',
        posts: postsByRedemption[r.id] ?? [],
      })));

      setReviews(
        doneRedemptions
          .filter((r: any) => r.business_rating != null)
          .map((r: any) => ({
            id: r.id,
            business_rating: r.business_rating,
            business_public_review: r.business_public_review ?? null,
            business_rated_at: r.business_rated_at,
            circuit_title: r.circuit?.title ?? 'Current',
            business_name: r.circuit?.business?.business_name ?? '',
          }))
      );
    }
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickAndUploadAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to set a profile picture.');
      return;
    }
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
      if (arrayBuffer.byteLength < 1000) {
        throw new Error('Photo not yet downloaded from iCloud. Please wait a moment and try again.');
      }
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: bustedUrl }).eq('id', userId);
      setCreator(prev => prev ? { ...prev, avatar_url: bustedUrl } : prev);
      Alert.alert('Done', 'Profile photo updated.');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  const location = (creator?.zip_code && ZIP_TO_NEIGHBORHOOD[creator.zip_code])
    ? ZIP_TO_NEIGHBORHOOD[creator.zip_code]
    : creator?.zip_code || creator?.city || null;
  const stars = creator && creator.rating_count > 0 ? Math.round(creator.avg_rating) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
          <Icon name="gear" size={20} color={C.muted2} />
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.accent} />} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <TouchableOpacity style={styles.avatarCircle} onPress={pickAndUploadAvatar} activeOpacity={0.8}>
              {creator?.avatar_url ? (
                <Image source={{ uri: creator.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Icon name="person" size={32} color={C.muted2} />
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
              <Text style={styles.name}>{creator?.full_name ?? '—'}</Text>
              {location && (
                <View style={styles.locationRow}>
                  <Icon name="pin" size={13} color={C.accent} />
                  <Text style={styles.locationText}>{location}</Text>
                </View>
              )}
              {creator && creator.rating_count > 0 && (
                <View style={styles.ratingRow}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon key={i} name={i < stars ? 'star-fill' : 'star'} size={14} color="#C39A3A" />
                  ))}
                  <Text style={styles.ratingNum}> {creator.avg_rating.toFixed(1)}</Text>
                  <Text style={styles.ratingCount}> ({creator.rating_count})</Text>
                </View>
              )}
            </View>
          </View>

          {/* Social pills */}
          <View style={styles.socialRow}>
            {creator?.tiktok_handle && !isVerified('tiktok') ? (
              <TouchableOpacity style={styles.socialPill} onPress={() => Linking.openURL(`https://www.tiktok.com/@${creator.tiktok_handle.replace('@', '')}`)} activeOpacity={0.7}>
                <SocialIcon kind="tt" size={16} color={C.ink} />
                <Text style={styles.socialPillText}>
                  {creator.tiktok_handle}{creator.follower_range ? `  ·  ${creator.follower_range}` : ''}
                </Text>
              </TouchableOpacity>
            ) : null}
            {creator?.instagram_handle && !isVerified('instagram') ? (
              <TouchableOpacity style={styles.socialPill} onPress={() => Linking.openURL(`https://www.instagram.com/${creator.instagram_handle.replace('@', '')}`)} activeOpacity={0.7}>
                <SocialIcon kind="ig" size={16} color={C.ink} />
                <Text style={styles.socialPillText}>
                  {creator.instagram_handle}{creator.follower_range ? `  ·  ${creator.follower_range}` : ''}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Connected accounts */}
          <View style={styles.connectSection}>
            <Text style={styles.connectHeader}>Connected accounts</Text>
            {(['tiktok', 'instagram'] as Platform[]).map(platform => {
              const conn = connections.find(c => c.platform === platform);
              return conn ? (
                <ConnectedAccountRow
                  key={platform}
                  conn={conn}
                  busy={connecting === platform}
                  onDisconnect={() => handleDisconnect(platform)}
                  onReconnect={() => handleConnect(platform)}
                />
              ) : (
                <ConnectButton
                  key={platform}
                  platform={platform}
                  busy={connecting === platform}
                  onPress={() => handleConnect(platform)}
                  onManual={platform === 'instagram' ? () => setManualFor(platform) : undefined}
                />
              );
            })}
          </View>
          <ManualEntrySheet
            platform={manualFor ?? 'instagram'}
            visible={!!manualFor}
            onClose={() => setManualFor(null)}
            onSave={handleManualSave}
          />

        </View>

        {/* Tabs */}
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
            {completed.length === 0 ? (
              <View style={styles.emptyBox}>
                <Icon name="sparkles" size={32} color={C.muted2} />
                <Text style={styles.emptyTitle}>No completed currents yet</Text>
                <Text style={styles.emptySubtitle}>Complete a current and it'll show up here</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {completed.map((item, idx) => {
                  const cardColors = [C.okSoft, C.accentTint, C.claimedBg, C.line];
                  const cardBg = cardColors[idx % cardColors.length];
                  return (
                  <TouchableOpacity key={item.id} style={[styles.gridCard, { backgroundColor: cardBg, borderColor: 'transparent' }]} onPress={() => setSelectedCircuit(item)} activeOpacity={0.8}>
                    <Text style={styles.gridBiz} numberOfLines={1}>{item.business_name.toUpperCase()}</Text>
                    <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.postLinks}>
                      {item.posts?.length > 0 ? item.posts.filter((p: any) => p.video_url).map((p: any, pi: number) => (
                        <View key={pi} style={styles.postLinkBtn}>
                          <Icon name="link" size={12} color={C.accent} />
                          <Text style={styles.postLinkText}>{p.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</Text>
                        </View>
                      )) : (
                        <View style={styles.completedBadge}>
                          <Icon name="check" size={11} color={C.ok} />
                          <Text style={styles.completedBadgeText}>Done</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {/* Follow-through stat */}
            {completed.length > 0 && (() => {
              const withPosts = completed.filter(c => c.posts && c.posts.length > 0).length;
              const pct = Math.round((withPosts / completed.length) * 100);
              return (
                <View style={styles.followThroughRow}>
                  <View style={styles.followThroughStat}>
                    <Text style={styles.followThroughNum}>{completed.length}</Text>
                    <Text style={styles.followThroughLabel}>currents</Text>
                  </View>
                  <View style={styles.followThroughDivider} />
                  <View style={styles.followThroughStat}>
                    <Text style={[styles.followThroughNum, pct === 100 ? styles.followThroughGreen : pct < 80 ? styles.followThroughRed : null]}>{pct}%</Text>
                    <Text style={styles.followThroughLabel}>posted on time</Text>
                  </View>
                </View>
              );
            })()}
            {reviews.length === 0 ? (
              <View style={styles.emptyBox}>
                <Icon name="star" size={32} color={C.muted2} />
                <Text style={styles.emptyTitle}>No reviews yet</Text>
                <Text style={styles.emptySubtitle}>Businesses will rate you after your content goes live</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {reviews.map(rev => {
                  const reviewDate = new Date(rev.business_rated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <View key={rev.id} style={styles.reviewCard}>
                      <View style={styles.reviewHeader}>
                        <Text style={styles.reviewBiz}>{rev.business_name.toUpperCase()}</Text>
                        <Text style={styles.reviewDate}>{reviewDate}</Text>
                      </View>
                      <Text style={styles.reviewCircuit}>{rev.circuit_title}</Text>
                      <View style={styles.reviewStars}>
                        {[1,2,3,4,5].map(n => (
                          <Icon key={n} name={n <= rev.business_rating ? 'star-fill' : 'star'} size={16} color="#C39A3A" />
                        ))}
                      </View>
                      {rev.business_public_review ? (
                        <Text style={styles.reviewText}>"{rev.business_public_review}"</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Post detail modal */}
      <Modal visible={!!selectedCircuit} transparent animationType="slide" onRequestClose={() => setSelectedCircuit(null)}>
        <View style={postModal.overlay}>
          <View style={postModal.sheet}>
            <View style={postModal.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={postModal.bizName}>{selectedCircuit?.business_name.toUpperCase()}</Text>
                <Text style={postModal.circuitTitle}>{selectedCircuit?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedCircuit(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={20} color={C.muted2} />
              </TouchableOpacity>
            </View>
            {selectedCircuit?.posts?.filter((p: any) => p.video_url).map((p: any, pi: number) => {
              const hasStats = p.views != null || p.comments != null || p.saves != null || p.reposts != null;
              return (
                <View key={pi} style={postModal.postBlock}>
                  <TouchableOpacity style={postModal.linkRow} onPress={() => Linking.openURL(p.video_url)} activeOpacity={0.75}>
                    <Icon name="link" size={14} color={C.accent} />
                    <Text style={postModal.linkText}>{p.platform === 'tiktok' ? 'TikTok' : 'Instagram'} post</Text>
                    <Icon name="arrow" size={13} color={C.accent} />
                  </TouchableOpacity>
                  {hasStats ? (
                    <View style={postModal.statsGrid}>
                      {[
                        { label: 'Views', val: p.views },
                        { label: 'Comments', val: p.comments },
                        { label: 'Saves', val: p.saves },
                        { label: 'Reposts', val: p.reposts },
                      ].map(s => (
                        <View key={s.label} style={postModal.statBox}>
                          <Text style={postModal.statNum}>{(s.val ?? 0).toLocaleString()}</Text>
                          <Text style={postModal.statLabel}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={postModal.pendingStats}>Stats will be added at 24h, 48h, and 7 days after posting.</Text>
                  )}
                </View>
              );
            })}
            {(!selectedCircuit?.posts || selectedCircuit.posts.filter((p: any) => p.video_url).length === 0) && (
              <Text style={postModal.pendingStats}>No post submitted yet.</Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  topBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 0 },
  settingsBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  profileCard: {
    backgroundColor: C.card, marginHorizontal: 16, marginTop: 8,
    borderRadius: R.lg, padding: 20, borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, marginRight: 16, overflow: 'visible' },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderRadius: 40,
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.muted2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.card,
  },
  profileInfo: { flex: 1 },
  name: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink, marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  locationText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.muted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingNum: { fontFamily: F.bodyBold, fontSize: 13, color: C.ink },
  ratingCount: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  socialPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.paper, borderWidth: 1.5, borderColor: C.line2,
    borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7,
  },
  socialPillText: { fontFamily: F.bodySemi, fontSize: 13, color: C.ink },
  connectSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, gap: 10 },
  connectHeader: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.2, color: C.muted2, textTransform: 'uppercase' },
  faveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, borderWidth: 1.5, borderColor: C.line2,
    borderRadius: R.md, paddingVertical: 12,
  },
  faveBtnText: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 20,
    backgroundColor: C.card, borderRadius: R.md, padding: 4,
    borderWidth: 1, borderColor: C.line,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: R.sm, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabActive: { backgroundColor: C.ink },
  tabText: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted2 },
  tabTextActive: { color: '#fff' },
  gridContainer: { paddingHorizontal: 16, paddingTop: 16 },
  emptyBox: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 40, alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: C.line,
  },
  emptyTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.ink },
  emptySubtitle: { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCard: {
    width: '47%', backgroundColor: C.card, borderRadius: R.lg, padding: 16,
    minHeight: 130, justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.line,
  },
  gridBiz: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.accent, textTransform: 'uppercase', marginBottom: 6 },
  gridTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 14, color: C.ink, lineHeight: 20, flex: 1 },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 10,
    backgroundColor: C.okSoft, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 4,
  },
  completedBadgeText: { fontFamily: F.bodySemi, fontSize: 11, color: C.ok },
  postLinks: { marginTop: 8, gap: 6 },
  postLinkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.accentTint, borderRadius: R.sm,
    paddingHorizontal: 8, paddingVertical: 5, alignSelf: 'flex-start',
  },
  postLinkText: { fontFamily: F.bodySemi, fontSize: 11, color: C.accent },
  reviewCard: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 18,
    borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewBiz: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.3, color: C.accent },
  reviewDate: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  reviewCircuit: { fontFamily: F.display, fontWeight: '700', fontSize: 14, color: C.ink, marginBottom: 10 },
  reviewStars: { flexDirection: 'row', gap: 3, marginBottom: 10 },
  reviewText: { fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 21, fontStyle: 'italic' },
  followThroughRow: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, marginBottom: 16, overflow: 'hidden',
  },
  followThroughStat: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  followThroughDivider: { width: 1, backgroundColor: C.line },
  followThroughNum: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 24, color: C.ink, letterSpacing: -0.4 },
  followThroughGreen: { color: C.ok },
  followThroughRed: { color: '#DC2626' },
  followThroughLabel: { fontFamily: F.mono, fontSize: 10.5, color: C.muted2, letterSpacing: 0.6, marginTop: 2 },
} as any);

const postModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  bizName: { fontFamily: F.mono, fontSize: 10.5, color: C.muted2, letterSpacing: 1.2, marginBottom: 3 },
  circuitTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 18, color: C.ink, letterSpacing: -0.3 },
  postBlock: { backgroundColor: C.paper, borderRadius: R.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  linkText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent, flex: 1 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: C.card, borderRadius: R.sm, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  statNum: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.accent },
  statLabel: { fontFamily: F.mono, fontSize: 9, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  pendingStats: { fontFamily: F.body, fontSize: 13, color: C.muted2, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
} as any);
