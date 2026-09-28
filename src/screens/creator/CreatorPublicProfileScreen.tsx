import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, Image, ActivityIndicator, Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';
import { Icon, Mark, SocialIcon } from '../../components/Icon';

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

function VerifiedMark() {
  return (
    <View style={styles.verifiedBadge}>
      <Icon name="check" size={10} color={C.ok} />
      <Text style={styles.verifiedText}>Verified</Text>
    </View>
  );
}

export default function CreatorPublicProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { creatorId } = route.params;

  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<any>(null);
  const [completed, setCompleted] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'circuits' | 'reviews'>('circuits');
  const [selectedCircuit, setSelectedCircuit] = useState<any>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: cr } = await supabase
      .from('creators')
      .select('*, profiles(full_name, avatar_url)')
      .eq('id', creatorId)
      .single();

    if (!cr) { setLoading(false); return; }

    const { data: ratings } = await supabase
      .from('redemptions').select('business_rating').eq('creator_id', cr.id).not('business_rating', 'is', null);

    const ratingCount = ratings?.length ?? 0;
    const avgRating = ratingCount > 0
      ? ratings!.reduce((s: number, r: any) => s + (r.business_rating ?? 0), 0) / ratingCount
      : 0;

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
        .select('redemption_id, platform, video_url, views, likes, comments')
        .in('redemption_id', redemptionIds);
      for (const p of (posts ?? [])) {
        if (!postsByRedemption[p.redemption_id]) postsByRedemption[p.redemption_id] = [];
        postsByRedemption[p.redemption_id].push(p);
      }
    }

    const done = redemptions ?? [];

    setCreator({
      full_name: cr.profiles?.full_name ?? 'Creator',
      avatar_url: cr.profiles?.avatar_url ?? null,
      instagram_handle: cr.instagram_handle ?? '',
      tiktok_handle: cr.tiktok_handle ?? '',
      follower_range: cr.follower_range ?? '',
      // Each platform's own tier: main platform uses follower_range, the other
      // uses secondary_follower_range.
      tiktok_range: (cr.main_platform ?? '').toLowerCase() === 'instagram'
        ? (cr.secondary_follower_range ?? '') : (cr.follower_range ?? ''),
      instagram_range: (cr.main_platform ?? '').toLowerCase() === 'instagram'
        ? (cr.follower_range ?? '') : (cr.secondary_follower_range ?? ''),
      tiktok_verified: !!cr.tiktok_verified,
      instagram_verified: !!cr.instagram_verified,
      zip_code: cr.zip_code ?? '',
      city: cr.city ?? '',
      avg_rating: avgRating,
      rating_count: ratingCount,
    });

    setCompleted(done.map((r: any) => ({
      id: r.id,
      title: r.circuit?.title ?? 'Current',
      business_name: r.circuit?.business?.business_name ?? '',
      posts: postsByRedemption[r.id] ?? [],
    })));

    setReviews(
      done.filter((r: any) => r.business_rating != null).map((r: any) => ({
        id: r.id,
        business_rating: r.business_rating,
        business_public_review: r.business_public_review ?? null,
        business_rated_at: r.business_rated_at,
        circuit_title: r.circuit?.title ?? 'Current',
        business_name: r.circuit?.business?.business_name ?? '',
      }))
    );

    setLoading(false);
  }

  const location = (creator?.zip_code && ZIP_TO_NEIGHBORHOOD[creator.zip_code])
    ? ZIP_TO_NEIGHBORHOOD[creator.zip_code]
    : creator?.zip_code || creator?.city || null;
  const stars = creator && creator.rating_count > 0 ? Math.round(creator.avg_rating) : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="back" size={20} color={C.accent} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="back" size={20} color={C.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatarCircle}>
              {creator?.avatar_url ? (
                <Image source={{ uri: creator.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Icon name="person" size={32} color={C.muted2} />
                </View>
              )}
            </View>
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

          <View style={styles.socialRow}>
            {creator?.tiktok_handle ? (
              <TouchableOpacity style={styles.socialPill} onPress={() => Linking.openURL(`https://www.tiktok.com/@${creator.tiktok_handle.replace('@', '')}`)} activeOpacity={0.7}>
                <SocialIcon kind="tt" size={16} color={C.ink} />
                <Text style={styles.socialPillText}>{creator.tiktok_handle}{creator.tiktok_range ? `  ·  ${creator.tiktok_range}` : ''}</Text>
                {creator.tiktok_verified && <VerifiedMark />}
              </TouchableOpacity>
            ) : null}
            {creator?.instagram_handle ? (
              <TouchableOpacity style={styles.socialPill} onPress={() => Linking.openURL(`https://www.instagram.com/${creator.instagram_handle.replace('@', '')}`)} activeOpacity={0.7}>
                <SocialIcon kind="ig" size={16} color={C.ink} />
                <Text style={styles.socialPillText}>{creator.instagram_handle}{creator.instagram_range ? `  ·  ${creator.instagram_range}` : ''}</Text>
                {creator.instagram_verified && <VerifiedMark />}
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
            {completed.length === 0 ? (
              <View style={styles.emptyBox}>
                <Icon name="sparkles" size={32} color={C.muted2} />
                <Text style={styles.emptyTitle}>No completed currents yet</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {completed.map((item, idx) => {
                  const cardColors = [C.okSoft, C.accentTint, C.claimedBg, C.line];
                  return (
                    <TouchableOpacity key={item.id} style={[styles.gridCard, { backgroundColor: cardColors[idx % cardColors.length], borderColor: 'transparent' }]} onPress={() => setSelectedCircuit(item)} activeOpacity={0.8}>
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
              const hasStats = p.views != null || p.likes != null || p.comments != null;
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
                        { label: 'Likes', val: p.likes },
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
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  profileCard: {
    backgroundColor: C.card, marginHorizontal: 16, marginTop: 8,
    borderRadius: R.lg, padding: 20, borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, marginRight: 16, overflow: 'hidden', backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.okSoft, borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedText: { fontFamily: F.bodySemi, fontSize: 10, color: C.ok },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCard: {
    width: '47%', backgroundColor: C.card, borderRadius: R.lg, padding: 16,
    minHeight: 130, justifyContent: 'space-between', borderWidth: 1, borderColor: C.line,
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
