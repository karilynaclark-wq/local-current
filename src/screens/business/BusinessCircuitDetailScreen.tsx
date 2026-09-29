import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, RefreshControl, Linking, Modal,
  TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Circuit, Post, FILLED_STATUSES } from '../../types';
import RequestsSection, { type RequestRow } from '../../components/RequestsSection';
import { C, F, R, S } from '../../theme';
import { Icon, SocialIcon } from '../../components/Icon';

// ─── Rating modal ─────────────────────────────────────────────────────────────
interface RatingModalProps {
  visible: boolean;
  redemptionId: string;
  circuitTitle: string;
  initialRating?: number;
  onClose: () => void;
  onSaved: () => void;
}

function RatingModal({ visible, redemptionId, circuitTitle, initialRating, onClose, onSaved }: RatingModalProps) {
  const [rating, setRating] = useState(initialRating ?? 0);
  useEffect(() => { setRating(initialRating ?? 0); }, [initialRating]);
  const [publicReview, setPublicReview] = useState('');
  const [privateReview, setPrivateReview] = useState('');
  const [appFeedback, setAppFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating before saving.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('redemptions').update({
      business_rating: rating,
      business_public_review: publicReview || null,
      business_private_review: privateReview || null,
      business_app_feedback: appFeedback || null,
      business_rated_at: new Date().toISOString(),
    }).eq('id', redemptionId);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={rStyles.overlay}>
          <View style={rStyles.sheet}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={rStyles.title}>Rate this creator</Text>
              <Text style={rStyles.sub}>For: {circuitTitle}</Text>

              {/* Stars */}
              <Text style={rStyles.label}>Overall rating</Text>
              <View style={rStyles.starsRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
                    <Icon name={n <= rating ? 'star-fill' : 'star'} size={32} color="#C39A3A" />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={rStyles.label}>Public review <Text style={rStyles.optional}>(shown on creator's profile)</Text></Text>
              <TextInput
                style={rStyles.input}
                value={publicReview}
                onChangeText={setPublicReview}
                placeholder="What was great about working with this creator?"
                placeholderTextColor={C.muted2}
                multiline
                numberOfLines={3}
              />

              <Text style={rStyles.label}>Private note <Text style={rStyles.optional}>(only you'll see this)</Text></Text>
              <TextInput
                style={rStyles.input}
                value={privateReview}
                onChangeText={setPrivateReview}
                placeholder="Anything you'd note for yourself about this collaboration?"
                placeholderTextColor={C.muted2}
                multiline
                numberOfLines={3}
              />

              <Text style={rStyles.label}>App feedback <Text style={rStyles.optional}>(sent to Current team)</Text></Text>
              <TextInput
                style={rStyles.input}
                value={appFeedback}
                onChangeText={setAppFeedback}
                placeholder="How was your experience using Current for this?"
                placeholderTextColor={C.muted2}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity style={[rStyles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                <Text style={rStyles.saveBtnText}>{saving ? 'Saving…' : 'Save rating'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={rStyles.cancelBtn} onPress={onClose}>
                <Text style={rStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const rStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, paddingBottom: 40, maxHeight: '90%',
  },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 22, color: C.ink, marginBottom: 4 },
  sub: { fontFamily: F.body, fontSize: 14, color: C.muted, marginBottom: 24 },
  label: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.ink, marginBottom: 8, marginTop: 16 },
  optional: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  starsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 14, color: C.ink, backgroundColor: C.paper,
    textAlignVertical: 'top', minHeight: 80,
  },
  saveBtn: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 16, alignItems: 'center', marginTop: 24, ...(S.button as any),
  },
  saveBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  cancelBtn: { alignItems: 'center', marginTop: 14 },
  cancelBtnText: { fontFamily: F.body, color: C.muted2, fontSize: 14 },
} as any);

// ─── Extend expiry modal ──────────────────────────────────────────────────────
interface ExtendModalProps {
  visible: boolean;
  currentExpiry: string | null;
  onClose: () => void;
  onSaved: (newDate: string) => void;
}

function ExtendModal({ visible, currentExpiry, onClose, onSaved }: ExtendModalProps) {
  const [dateText, setDateText] = useState('');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    // Parse MM/DD/YYYY
    const parts = dateText.split('/');
    if (parts.length !== 3 || parts.some(p => !p)) {
      Alert.alert('Invalid date', 'Please enter the date as MM/DD/YYYY.');
      return;
    }
    const [mm, dd, yyyy] = parts;
    const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T23:59:59Z`);
    if (isNaN(parsed.getTime())) {
      Alert.alert('Invalid date', 'Please enter a valid date.');
      return;
    }
    if (parsed <= new Date()) {
      Alert.alert('Invalid date', 'The new expiry date must be in the future.');
      return;
    }
    setSaving(true);
    onSaved(parsed.toISOString());
    setSaving(false);
  }

  const currentFormatted = currentExpiry
    ? new Date(currentExpiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'None';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={eStyles.overlay}>
          <View style={eStyles.box}>
            <Text style={eStyles.title}>Extend expiry</Text>
            {currentExpiry && (
              <Text style={eStyles.current}>Current: {currentFormatted}</Text>
            )}
            <Text style={eStyles.label}>New expiry date (MM/DD/YYYY)</Text>
            <TextInput
              style={eStyles.input}
              value={dateText}
              onChangeText={setDateText}
              placeholder="e.g. 08/15/2026"
              placeholderTextColor={C.muted2}
              keyboardType="numbers-and-punctuation"
              autoFocus
            />
            <TouchableOpacity style={[eStyles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={eStyles.saveBtnText}>Update expiry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={eStyles.cancelBtn} onPress={onClose}>
              <Text style={eStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const eStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  box: { backgroundColor: C.card, borderRadius: R.lg, padding: 28, width: '100%', ...(S.menu as any) },
  title: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink, marginBottom: 6 },
  current: { fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 18 },
  label: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.ink, marginBottom: 8 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 14, fontSize: 15, color: C.ink, backgroundColor: C.paper,
  },
  saveBtn: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 15, alignItems: 'center', marginTop: 20, ...(S.button as any),
  },
  saveBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  cancelBtn: { alignItems: 'center', marginTop: 12 },
  cancelBtnText: { fontFamily: F.body, color: C.muted2, fontSize: 14 },
} as any);

// ─── Main screen ──────────────────────────────────────────────────────────────
interface RedemptionWithRating {
  id: string;
  status: any;
  requested_at: string | null;
  claimed_at: string | null;
  access_details: string | null;
  creator_id: string | null;
  business_rating: number | null;
  business_rated_at: string | null;
}

export default function BusinessCircuitDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [circuit, setCircuit] = useState<Circuit>(route.params.circuit);
  const [circuitLoaded, setCircuitLoaded] = useState(false);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  const [posts, setPosts] = useState<(Post & { creatorName?: string; creatorHandle?: string })[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionWithRating[]>([]);
  const [stats, setStats] = useState({ claims: 0, checkins: 0, posts: 0, views: 0, likes: 0, comments: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showVoucherPreview, setShowVoucherPreview] = useState(false);
  const [creatorListModal, setCreatorListModal] = useState<{ title: string; creators: any[] } | null>(null);
  const [ratingTarget, setRatingTarget] = useState<{ redemptionId: string; existingRating?: number } | null>(null);

  // Map postId → redemptionId so we can rate from a post card
  const [postRedemptionMap, setPostRedemptionMap] = useState<Record<string, string>>({});
  const [postRatingMap, setPostRatingMap] = useState<Record<string, number | null>>({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data: p }) => { if (p?.full_name) setOwnerName(p.full_name); });
    }
    const { data: freshCircuit, error: circuitError } = await supabase
      .from('circuits')
      .select('*, business:businesses(business_name, address, instagram_handle, tiktok_handle)')
      .eq('id', route.params.circuit.id)
      .single();
    if (freshCircuit) setCircuit(freshCircuit);
    setCircuitLoaded(true);

    const claimsRes = await supabase
      .from('redemptions')
      .select('id, status, creator_id, business_rating, business_rated_at, requested_at, claimed_at, access_details')
      .eq('circuit_id', route.params.circuit.id);
    const redemptionData: RedemptionWithRating[] = claimsRes.data ?? [];
    const redemptionIds = redemptionData.map((r: any) => r.id);
    const creatorIds = [...new Set((redemptionData as any[]).map((r: any) => r.creator_id).filter(Boolean))];

    // Fetch posts and creators separately to avoid RLS blocking nested joins
    const [postsRes, creatorsRes] = await Promise.all([
      redemptionIds.length > 0
        ? supabase.from('posts').select('id, redemption_id, creator_id, video_url, platform, views, likes, comments, submitted_at').in('redemption_id', redemptionIds)
        : Promise.resolve({ data: [] as any[] }),
      creatorIds.length > 0
        ? supabase.from('creators').select('*, profile:profiles(id, full_name)').in('id', creatorIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const creatorById: Record<string, any> = {};
    for (const c of (creatorsRes.data ?? []) as any[]) { creatorById[c.id] = c; }

    // Merge creator into redemption objects so creator list modals still work
    const enrichedRedemptions = redemptionData.map((r: any) => ({
      ...r,
      creator: creatorById[r.creator_id] ?? null,
    }));
    setRedemptions(enrichedRedemptions);

    // Build creator info map keyed by redemption id
    const redemptionCreatorMap: Record<string, any> = {};
    for (const r of enrichedRedemptions as any[]) {
      if (r.creator) redemptionCreatorMap[r.id] = r.creator;
    }

    // Build lookup maps
    const prMap: Record<string, string> = {};
    const ratingMap: Record<string, number | null> = {};
    for (const r of redemptionData) {
      const rPosts = (postsRes.data ?? []).filter((p: any) => p.redemption_id === r.id);
      for (const p of rPosts) {
        prMap[p.id] = r.id;
        ratingMap[p.id] = r.business_rating;
      }
    }
    setPostRedemptionMap(prMap);
    setPostRatingMap(ratingMap);

    const postList = (postsRes.data ?? []).map((p: any) => {
      const creator = redemptionCreatorMap[p.redemption_id];
      return {
        ...p,
        creatorName: creator?.profile?.full_name ?? null,
        creatorId: creator?.id ?? null,
      };
    });
    setPosts(postList);
    const filled = redemptionData.filter((r: any) => FILLED_STATUSES.includes(r.status));
    setStats({
      claims: filled.length,
      checkins: redemptionData.filter((r: any) => r.status === 'checked_in' || r.status === 'completed').length,
      posts: postList.length,
      views: postList.reduce((s: number, p: any) => s + (p.views ?? 0), 0),
      likes: postList.reduce((s: number, p: any) => s + (p.likes ?? 0), 0),
      comments: postList.reduce((s: number, p: any) => s + (p.comments ?? 0), 0),
    });
    setRefreshing(false);
  }

  async function handleDelete() {
    const claimCount = stats.claims;
    const message = claimCount > 0
      ? `${claimCount} creator${claimCount > 1 ? 's have' : ' has'} already been approved for this opp. Are you sure you want to delete it?`
      : 'Are you sure you want to delete this current? This cannot be undone.';

    Alert.alert('Delete current', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const { error } = await supabase.from('circuits').delete().eq('id', circuit.id);
          if (error) { Alert.alert('Error', error.message); setDeleting(false); }
          else { navigation.goBack(); }
        },
      },
    ]);
  }

  async function handleTogglePause() {
    setToggling(true);
    const newActive = !circuit.is_active;
    const { error } = await supabase.from('circuits').update({ is_active: newActive }).eq('id', circuit.id);
    if (error) { Alert.alert('Error', error.message); }
    else { setCircuit(prev => ({ ...prev, is_active: newActive })); }
    setToggling(false);
  }

  async function handleExtend(newDate: string) {
    const { error } = await supabase.from('circuits').update({ expires_at: newDate, is_active: true, expired_notified: false }).eq('id', circuit.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setCircuit(prev => ({ ...prev, expires_at: newDate, is_active: true }));
    setShowExtendModal(false);
    Alert.alert('Expiry updated', 'The current is now active with the new expiry date.');
  }

  const allowedRanges = circuit.eligibility_min_followers
    ? circuit.eligibility_min_followers.split(',').map(r => r.trim())
    : [];

  const isExpired = circuit.expires_at ? new Date(circuit.expires_at) < new Date() : false;

  function renderPost({ item }: { item: Post }) {
    const isIG = item.platform === 'instagram';
    const label = isIG ? 'Instagram' : item.platform === 'tiktok' ? 'TikTok' : item.platform;
    const redemptionId = postRedemptionMap[item.id];
    const existingRating = postRatingMap[item.id];

    const hasStats = item.views != null || (item as any).likes != null || (item as any).comments != null;
    return (
      <View style={styles.postCard}>
        {(item as any).creatorName && (
          <TouchableOpacity onPress={() => (item as any).creatorId && navigation.navigate('CreatorPublicProfile', { creatorId: (item as any).creatorId })} activeOpacity={0.7}>
            <Text style={styles.postCreatorName}>{(item as any).creatorName}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.postHeader} onPress={() => Linking.openURL(item.video_url)} activeOpacity={0.75}>
          <View style={styles.platformBadge}>
            <SocialIcon kind={isIG ? 'ig' : 'tt'} size={14} color={C.ink} />
            <Text style={styles.platformText}>{label}</Text>
          </View>
          <View style={styles.postLinkRow}>
            <Text style={styles.postLinkLabel}>Open post</Text>
            <Icon name="arrow" size={14} color={C.accent} />
          </View>
        </TouchableOpacity>
        {hasStats ? (
          <View style={styles.postStatsGrid}>
            {[
              { label: 'Views', val: item.views },
              { label: 'Likes', val: (item as any).likes },
              { label: 'Comments', val: (item as any).comments },
            ].map(s => (
              <View key={s.label} style={styles.postStatBox}>
                <Text style={styles.postStatNum}>{(s.val ?? 0).toLocaleString()}</Text>
                <Text style={styles.postStatLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.statsPending}>Stats updated at 24h, 48h, and 7 days after posting.</Text>
        )}
        {/* Rating row */}
        {redemptionId && (
          <TouchableOpacity style={styles.rateBtn} onPress={() => setRatingTarget({ redemptionId, existingRating: existingRating ?? undefined })} activeOpacity={0.8}>
            {existingRating != null ? (
              <>
                {[1,2,3,4,5].map(n => (
                  <Icon key={n} name={n <= existingRating ? 'star-fill' : 'star'} size={14} color="#C39A3A" />
                ))}
                <Text style={styles.rateBtnText}>Edit rating</Text>
              </>
            ) : (
              <>
                <Icon name="star" size={15} color={C.accent} />
                <Text style={styles.rateBtnText}>Rate this creator</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={C.accent} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
              <Icon name="back" size={20} color={C.accent} />
            </TouchableOpacity>

            {isExpired && !circuit.is_active && (
              <View style={styles.expiredBanner}>
                <Icon name="close" size={14} color="#92400E" />
                <Text style={styles.expiredBannerText}>This current has expired.</Text>
                <TouchableOpacity onPress={() => setShowExtendModal(true)}>
                  <Text style={styles.expiredBannerLink}>Extend expiry →</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.circuitTitle}>{circuit.title}</Text>
            {!!circuit.description && <Text style={styles.circuitDesc}>{circuit.description}</Text>}

            <RequestsSection
              circuit={circuit}
              rows={redemptions as unknown as RequestRow[]}
              onChanged={loadData}
              onOpenCreator={creatorId => navigation.navigate('CreatorPublicProfile', { creatorId })}
            />

            {/* Analytics only once creators have posted — nothing to show before. */}
            {stats.posts > 0 && (<>
            <View style={styles.statsRow}>
              {[
                {
                  num: stats.claims, label: 'Approved',
                  onPress: () => setCreatorListModal({
                    title: 'Approved',
                    creators: redemptions
                      .filter((r: any) => FILLED_STATUSES.includes(r.status))
                      .map((r: any) => r.creator).filter(Boolean),
                  }),
                },
                {
                  num: stats.posts, label: 'Posts',
                  onPress: () => setCreatorListModal({
                    title: 'Posts',
                    creators: posts.map((p: any) => p.redemption?.creator).filter(Boolean),
                  }),
                },
              ].map(s => (
                <TouchableOpacity key={s.label} style={styles.statCard} onPress={s.onPress} activeOpacity={0.75}>
                  <Text style={styles.statNum}>{s.num}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.statsRow}>
              {[
                { num: stats.views, label: 'Views' },
                { num: stats.likes, label: 'Likes' },
                { num: stats.comments, label: 'Comments' },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={styles.statNum}>{s.num.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            </>)}

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Opp details</Text>
              {circuit.guest_count != null && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Each creator gets</Text>
                  <Text style={styles.detailValue}>
                    {circuit.guest_count === 0 ? 'Just them' : `Them + ${circuit.guest_count} friend${circuit.guest_count > 1 ? 's' : ''}`}
                  </Text>
                </View>
              )}
              {circuit.max_redemptions != null && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Max creators</Text>
                  <Text style={styles.detailValue}>{circuit.max_redemptions}</Text>
                </View>
              )}
              {allowedRanges.length > 0 && (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Follower range</Text>
                  <View style={styles.chipRow}>
                    {allowedRanges.map(r => <View key={r} style={styles.chip}><Text style={styles.chipText}>{r}</Text></View>)}
                  </View>
                </View>
              )}
              {circuit.eligibility_niches?.length > 0 && (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Niches</Text>
                  <View style={styles.chipRow}>
                    {circuit.eligibility_niches.map(n => <View key={n} style={styles.chip}><Text style={styles.chipText}>{n}</Text></View>)}
                  </View>
                </View>
              )}
            </View>

            {posts.length > 0 && <Text style={styles.sectionTitle}>Creator posts</Text>}
          </View>
        }
        contentContainerStyle={styles.list}
        ListFooterComponent={
          <>
            <TouchableOpacity
              style={[styles.actionBtn, circuit.is_active ? styles.actionBtnPause : styles.actionBtnResume, toggling && { opacity: 0.6 }, { marginTop: posts.length > 0 ? 24 : 0, justifyContent: 'center', paddingVertical: 15 }]}
              onPress={handleTogglePause}
              disabled={toggling}
              activeOpacity={0.8}
            >
              <Icon name={circuit.is_active ? 'close' : 'check'} size={15} color={circuit.is_active ? C.muted : '#fff'} />
              <Text style={[styles.actionBtnText, !circuit.is_active && { color: '#fff' }]}>
                {toggling ? '…' : circuit.is_active ? 'Pause this current' : 'Resume this current'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled, { marginTop: 12 }]} onPress={handleDelete} disabled={deleting}>
              <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete this current'}</Text>
            </TouchableOpacity>
          </>
        }
      />

      <Modal visible={!!creatorListModal} transparent animationType="slide">
        <View style={styles.voucherModalOverlay}>
          <View style={styles.voucherModalSheet}>
            <Text style={styles.voucherModalTitle}>{creatorListModal?.title}</Text>
            <Text style={styles.exampleVoucherNote}>{creatorListModal?.creators.length ?? 0} creator{(creatorListModal?.creators.length ?? 0) !== 1 ? 's' : ''}</Text>
            {(creatorListModal?.creators.length ?? 0) === 0 ? (
              <Text style={[styles.exampleVoucherNote, { marginTop: 16 }]}>No creators yet.</Text>
            ) : (
              creatorListModal!.creators.map((c: any, i: number) => {
                const name = c.profile?.full_name ?? 'Unknown';
                const handle = c.instagram_handle || c.tiktok_handle || null;
                const profileId = c.profile_id ?? c.profile?.id;
                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.creatorListRow}
                    onPress={() => {
                      const creatorId = c.id;
                      setCreatorListModal(null);
                      requestAnimationFrame(() => navigation.navigate('CreatorPublicProfile', { creatorId }));
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.creatorListAvatar}>
                      <Text style={styles.creatorListInitial}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.creatorListName}>{name}</Text>
                      {handle && <Text style={styles.creatorListHandle}>@{handle.replace('@', '')}</Text>}
                    </View>
                    <Icon name="arrow" size={14} color={C.accent} />
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity style={styles.voucherModalClose} onPress={() => setCreatorListModal(null)} activeOpacity={0.8}>
              <Text style={styles.voucherModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showVoucherPreview} transparent animationType="slide">
        <View style={styles.voucherModalOverlay}>
          <View style={styles.voucherModalSheet}>
            <Text style={styles.voucherModalTitle}>Example voucher</Text>
            <Text style={styles.exampleVoucherNote}>This is what creators will show your staff when they visit.</Text>
            <View style={styles.voucherCard}>
              <View style={styles.voucherCardTopRow}>
                <Text style={styles.voucherBizName}>{(circuit as any).business?.business_name?.toUpperCase() ?? 'YOUR BUSINESS'}</Text>
                <View style={styles.voucherValidBadge}>
                  <View style={styles.voucherValidDot} />
                  <Text style={styles.voucherValidText}>VALID</Text>
                </View>
              </View>
              <Text style={styles.voucherCardTitle}>{circuit.title}</Text>
              {!!circuit.description && (
                <Text style={styles.voucherDesc}>{circuit.description}</Text>
              )}
              <View style={styles.voucherMetaSection}>
                <View style={styles.voucherMetaRow}>
                  <Text style={styles.voucherMetaLabel}>CREATOR</Text>
                  <Text style={styles.voucherMetaValue}>Jane Smith</Text>
                </View>
                <View style={styles.voucherMetaSep} />
                <View style={styles.voucherMetaRow}>
                  <Text style={styles.voucherMetaLabel}>POINT OF CONTACT</Text>
                  <Text style={styles.voucherMetaValue}>{ownerName ?? 'Your Name'}</Text>
                </View>
                <View style={styles.voucherMetaSep} />
                <View style={styles.voucherMetaRow}>
                  <Text style={styles.voucherMetaLabel}>REF</Text>
                  <Text style={styles.voucherRefValue}>EXAMPLE</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.voucherModalClose} onPress={() => setShowVoucherPreview(false)} activeOpacity={0.8}>
              <Text style={styles.voucherModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ExtendModal
        visible={showExtendModal}
        currentExpiry={circuit.expires_at ?? null}
        onClose={() => setShowExtendModal(false)}
        onSaved={handleExtend}
      />

      {ratingTarget && (
        <RatingModal
          visible={true}
          redemptionId={ratingTarget.redemptionId}
          circuitTitle={circuit.title}
          initialRating={ratingTarget.existingRating}
          onClose={() => setRatingTarget(null)}
          onSaved={loadData}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  list: { padding: 16 },
  header: { marginBottom: 16 },
  back: { marginBottom: 16 },
  expiredBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7', borderRadius: R.md, padding: 12,
    borderWidth: 1, borderColor: '#FCD34D', marginBottom: 16,
  },
  expiredBannerText: { fontFamily: F.bodyMedium, fontSize: 13, color: '#92400E', flex: 1 },
  expiredBannerLink: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  circuitTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 24, letterSpacing: -0.4, color: C.ink, marginBottom: 6 },
  circuitDesc: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 16 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1.5,
  },
  actionBtnPause: { borderColor: C.line2, backgroundColor: C.paper },
  actionBtnResume: { borderColor: C.accent, backgroundColor: C.accent },
  actionBtnExtend: { borderColor: C.line2, backgroundColor: C.paper },
  actionBtnText: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.muted },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: R.md, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  statNum: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 28, color: C.accent, letterSpacing: -0.5 },
  statLabel: { fontFamily: F.mono, fontSize: 11, color: C.muted2, marginTop: 2, letterSpacing: 0.6 },
  detailSection: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: C.line,
  },
  detailSectionTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 14, color: C.ink, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'flex-start' },
  detailBlock: { marginBottom: 10 },
  detailLabel: { fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 4 },
  detailValue: { fontFamily: F.bodyMedium, fontSize: 13, color: C.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.paper },
  chipText: { fontFamily: F.bodyMedium, fontSize: 12, color: C.muted },
  sectionTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.ink, marginBottom: 8 },
  creatorListRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  creatorListAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  creatorListInitial: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.accent },
  creatorListName: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  creatorListHandle: { fontFamily: F.body, fontSize: 13, color: C.muted2, marginTop: 1 },
  voucherModalOverlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  voucherModalSheet: { backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  voucherModalTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 22, color: C.ink, marginBottom: 4 },
  voucherModalClose: { backgroundColor: C.card, borderRadius: R.btn, padding: 15, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: C.line },
  voucherModalCloseText: { fontFamily: F.bodySemi, fontSize: 15, color: C.muted },
  exampleVoucherWrap: { marginBottom: 24 },
  exampleVoucherNote: { fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 12, marginTop: -4 },
  voucherCard: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 20,
    borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  voucherCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  voucherBizName: { fontFamily: F.mono, fontSize: 10.5, color: C.muted2, letterSpacing: 1.6 },
  voucherValidBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.okSoft, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  voucherValidDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok },
  voucherValidText: { fontFamily: F.mono, fontSize: 10, color: C.ok, letterSpacing: 1 },
  voucherCardTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 22, color: C.ink, letterSpacing: -0.4, marginBottom: 14 },
  voucherDesc: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 16 },
  voucherMetaSection: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, gap: 0 },
  voucherMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  voucherMetaSep: { height: 1, backgroundColor: C.line },
  voucherMetaLabel: { fontFamily: F.mono, fontSize: 10, color: C.muted2, letterSpacing: 1.2, textTransform: 'uppercase' },
  voucherMetaValue: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  voucherRefValue: { fontFamily: F.monoBold, fontSize: 15, color: C.ink, letterSpacing: 1.5 },
  postCard: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  platformBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.accentTint, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.sm,
  },
  platformText: { fontFamily: F.mono, fontSize: 11, color: C.ink, textTransform: 'capitalize', letterSpacing: 0.4 },
  postLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postLinkLabel: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  postCreatorName: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent, marginBottom: 8, textDecorationLine: 'underline' },
  postStatsGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  postStatBox: { flex: 1, backgroundColor: C.paper, borderRadius: R.sm, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  postStatNum: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.accent },
  postStatLabel: { fontFamily: F.mono, fontSize: 9, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
  statsPending: { fontFamily: F.body, fontSize: 12, color: C.muted2, fontStyle: 'italic', marginBottom: 8 },
  postMeta: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  metaStat: { fontFamily: F.bodyMedium, fontSize: 13, color: C.inkSoft },
  rateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: C.accentSoft, borderRadius: R.sm,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 4,
    backgroundColor: C.accentTint,
  },
  rateBtnText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  ratedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  ratedLabel: { fontFamily: F.body, fontSize: 12, color: C.muted2, marginLeft: 4 },
  empty: { fontFamily: F.body, textAlign: 'center', color: C.muted, marginTop: 32, fontSize: 14 },
  deleteBtn: { marginTop: 24, marginBottom: 16, padding: 16, borderRadius: R.md, borderWidth: 1.5, borderColor: '#FCA5A5', alignItems: 'center' },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnText: { fontFamily: F.bodySemi, color: '#DC2626', fontSize: 15 },
} as any);
