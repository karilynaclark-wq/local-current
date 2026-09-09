import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, Modal, Linking, TextInput,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { Circuit } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';
import { getPushToken, sendPush } from '../../lib/notifications';
import { trackEvent } from '../../lib/analytics';
import { isEligibleForCircuit, currentlyEligibleRanges, creatorFollowersByPlatform, eligibilityStatus } from '../../lib/eligibility';

const CHECK_IN_RADIUS_METERS = 400;

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function useCountdown(target: string | null) {
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { setExpired(true); setRemaining('Expired'); return; }
      const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      setRemaining(`${h} : ${m} : ${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return { remaining, expired };
}

function formatRef(id: string) {
  const clean = id.replace(/-/g, '').toUpperCase();
  return `CRT-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

const REPORT_OPTIONS = [
  { value: 'not_honored', label: "Business didn't honor the voucher" },
  { value: 'negative_experience', label: 'Experience was negative' },
  { value: 'other', label: 'Something else' },
];

function ReportModal({ visible, redemptionId, onClose }: { visible: boolean; redemptionId: string; onClose: () => void }) {
  const [reportType, setReportType] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!reportType) { Alert.alert('Select an option', 'Please choose what happened.'); return; }
    setSaving(true);
    const { error } = await supabase.from('redemptions').update({
      problem_report_type: reportType,
      problem_report_details: details || null,
      problem_reported_at: new Date().toISOString(),
    }).eq('id', redemptionId);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    // Notify admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', 'hello@join-circuit.com')
      .single();
    if (adminProfile) {
      const token = await getPushToken(adminProfile.id);
      if (token) sendPush(token, 'Problem reported ⚠️', `A creator reported an issue: ${reportType.replace(/_/g, ' ')}`);
    }
    Alert.alert('Report submitted', 'Our team will review this and follow up if needed.');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={rStyles.overlay}>
        <View style={rStyles.sheet}>
          <Text style={rStyles.title}>Report a problem</Text>
          <Text style={rStyles.sub}>What happened?</Text>
          {REPORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[rStyles.option, reportType === opt.value && rStyles.optionSelected]}
              onPress={() => setReportType(opt.value)}
              activeOpacity={0.8}
            >
              <View style={[rStyles.radio, reportType === opt.value && rStyles.radioSelected]} />
              <Text style={[rStyles.optionText, reportType === opt.value && rStyles.optionTextSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={rStyles.input}
            value={details}
            onChangeText={setDetails}
            placeholder="Any additional details (optional)"
            placeholderTextColor={C.muted2}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity style={[rStyles.submitBtn, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving}>
            <Text style={rStyles.submitBtnText}>{saving ? 'Submitting…' : 'Submit report'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={rStyles.cancelBtn} onPress={onClose}>
            <Text style={rStyles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const rStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 40 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 20, color: C.ink, marginBottom: 4 },
  sub: { fontFamily: F.body, fontSize: 14, color: C.muted, marginBottom: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.md, marginBottom: 8, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.paper },
  optionSelected: { borderColor: C.accent, backgroundColor: C.accentTint },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.line2 },
  radioSelected: { borderColor: C.accent, backgroundColor: C.accent },
  optionText: { fontFamily: F.body, fontSize: 14, color: C.ink, flex: 1 },
  optionTextSelected: { fontFamily: F.bodySemi, color: C.accent },
  input: { fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, padding: 13, fontSize: 14, color: C.ink, backgroundColor: C.paper, textAlignVertical: 'top', minHeight: 70, marginTop: 8, marginBottom: 4 },
  submitBtn: { backgroundColor: C.accent, borderRadius: R.btn, padding: 15, alignItems: 'center', marginTop: 16, ...(S.button as any) },
  submitBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  cancelBtn: { alignItems: 'center', marginTop: 12 },
  cancelBtnText: { fontFamily: F.body, color: C.muted2, fontSize: 14 },
} as any);

export default function CircuitDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const circuit: Circuit = route.params.circuit;
  const [loading, setLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showUnclaimModal, setShowUnclaimModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [creatorFollowerRange, setCreatorFollowerRange] = useState<string | null>(null);
  const [creatorFollowers, setCreatorFollowers] = useState<{ tiktok?: string; instagram?: string }>({});
  const [showReqModal, setShowReqModal] = useState(false);
  const [assignedCode, setAssignedCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookMonth, setBookMonth] = useState('');
  const [bookDay, setBookDay] = useState('');
  const [bookYear, setBookYear] = useState('');
  const [booking, setBooking] = useState(false);
  const [creatorNiches, setCreatorNiches] = useState<string[]>([]);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligStatus, setEligStatus] = useState<'eligible' | 'soon' | 'no' | null>(null);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [redemptionStatus, setRedemptionStatus] = useState<string | null>(null);
  const [redemptionId, setRedemptionId] = useState<string | null>(null);
  const [hasPost, setHasPost] = useState(false);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [businessContactName, setBusinessContactName] = useState<string | null>(null);
  const [voucherWindowEnd, setVoucherWindowEnd] = useState<string | null>(null);
  const [problemReportedAt, setProblemReportedAt] = useState<string | null>(null);
  const [isFull, setIsFull] = useState(false);

  const postDeadline = checkedInAt
    ? new Date(new Date(checkedInAt).getTime() + 48 * 60 * 60 * 1000).toISOString()
    : null;
  const { remaining: voucherRemaining, expired: voucherExpired } = useCountdown(voucherWindowEnd);
  const { remaining: postRemaining, expired: postExpired } = useCountdown(postDeadline);

  // Auto-redeem when the 4-hour check-in window closes
  useEffect(() => {
    if (voucherExpired && redemptionStatus === 'checked_in' && redemptionId) {
      supabase.from('redemptions')
        .update({ redeemed_at: new Date().toISOString(), status: 'completed' })
        .eq('id', redemptionId)
        .then(() => {
          supabase.from('circuit_codes').update({ is_used: true }).eq('redemption_id', redemptionId);
          setRedemptionStatus('completed');
        });
    }
  }, [voucherExpired]);

  function fetchRedemptionStatus() {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('creators').select('id').eq('profile_id', user.id).single()
        .then(({ data: creator }) => {
          if (!creator) return;
          supabase.from('redemptions')
            .select('id, status, checked_in_at, expires_at, problem_reported_at')
            .eq('circuit_id', circuit.id)
            .eq('creator_id', creator.id)
            .limit(1).single()
            .then(({ data: existing }) => {
              if (existing) {
                setHasClaimed(true);
                setRedemptionStatus(existing.status ?? null);
                setRedemptionId(existing.id);
                setCheckedInAt(existing.checked_in_at ?? null);
                setProblemReportedAt(existing.problem_reported_at ?? null);
                if (existing.checked_in_at) {
                  setVoucherWindowEnd(new Date(new Date(existing.checked_in_at).getTime() + 4 * 60 * 60 * 1000).toISOString());
                }
                // Fetch this creator's redemption code (unique per creator, or a
                // single shared code if the business only supplied one).
                supabase.from('circuit_codes').select('code, redemption_id').eq('circuit_id', circuit.id)
                  .then(({ data: codeRows }) => {
                    if (!codeRows || codeRows.length === 0) return;
                    if (codeRows.length === 1) { setAssignedCode(codeRows[0].code); return; }
                    const mine = codeRows.find(c => c.redemption_id === existing.id);
                    setAssignedCode(mine?.code ?? null);
                  });
                supabase.from('posts').select('id', { count: 'exact', head: true }).eq('redemption_id', existing.id)
                  .then(({ count }) => setHasPost((count ?? 0) > 0));
              }
            });
        });
    });
  }

  useFocusEffect(useCallback(() => { fetchRedemptionStatus(); }, []));

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
        .then(({ data }) => {
          setRole(data?.role ?? null);
          if (data?.full_name) setCreatorName(data.full_name);
          // Fetch business contact name from the business owner's profile
          if (circuit.business_id) {
            supabase.from('businesses').select('profile_id').eq('id', circuit.business_id).single()
              .then(({ data: biz }) => {
                if (biz?.profile_id) {
                  supabase.from('profiles').select('full_name').eq('id', biz.profile_id).single()
                    .then(({ data: p }) => { if (p?.full_name) setBusinessContactName(p.full_name); });
                }
              });
          }
          if (data?.role === 'creator') {
            supabase.from('creators').select('id, follower_range, niche, status, main_platform, secondary_platform, secondary_follower_range').eq('profile_id', user.id).single()
              .then(({ data: creator }) => {
                if (!creator) return;
                setCreatorId(creator.id);
                setCreatorStatus(creator.status ?? null);
                const range = creator.follower_range ?? '';
                const niches = creator.niche ? creator.niche.split(',').map((n: string) => n.trim()) : [];
                const followers = creatorFollowersByPlatform(creator);
                setCreatorFollowerRange(range);
                setCreatorFollowers(followers);
                setCreatorNiches(niches);
                setEligible(isEligibleForCircuit(circuit, range, niches, followers));
                setEligStatus(eligibilityStatus(circuit, range, niches, followers));
                if (circuit.max_redemptions != null) {
                  supabase.from('redemptions').select('id', { count: 'exact', head: true }).eq('circuit_id', circuit.id)
                    .then(({ count }) => { if (count != null && count >= circuit.max_redemptions) setIsFull(true); });
                }
              });
          }
        });
    });
  }, []);

  async function handleClaim() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: creator } = await supabase.from('creators').select('id').eq('profile_id', user.id).single();
      if (!creator) throw new Error('Creator profile not found');

      if (circuit.max_redemptions != null) {
        const { count } = await supabase.from('redemptions').select('id', { count: 'exact', head: true }).eq('circuit_id', circuit.id);
        if (count != null && count >= circuit.max_redemptions) {
          Alert.alert('No spots left', 'All spots for this current have been claimed.');
          return;
        }
      }

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: recentClaims } = await supabase
        .from('redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', creator.id)
        .gte('claimed_at', fifteenMinutesAgo);
      if ((recentClaims ?? 0) > 0) {
        Alert.alert('Slow down', 'You can only claim one current every 15 minutes. Come back shortly!');
        return;
      }

      const { data: redemption, error } = await supabase.from('redemptions').insert({
        circuit_id: circuit.id,
        creator_id: creator.id,
        status: 'claimed',
      }).select().single();
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent('circuit_claimed', { circuit_id: circuit.id, circuit_title: circuit.title, business_id: circuit.business_id });

      // Code assignment happens server-side via the assign_circuit_code
      // trigger on redemptions insert (creators can't read/write circuit_codes
      // directly under RLS). The assigned code is then readable via the
      // circuit_codes_select_own policy.

      if (circuit.max_redemptions != null) {
        const { count } = await supabase.from('redemptions').select('id', { count: 'exact', head: true }).eq('circuit_id', circuit.id);
        if (count != null && count >= circuit.max_redemptions) {
          await supabase.from('circuits').update({ is_active: false }).eq('id', circuit.id);
        }
      }

      const { data: biz } = await supabase.from('businesses').select('profile_id').eq('id', circuit.business_id).single();
      if (biz?.profile_id) {
        const token = await getPushToken(biz.profile_id);
        if (token) sendPush(token, 'New claim! 🎉', `A creator just claimed your "${circuit.title}" current`);
        supabase.from('profiles').select('full_name').eq('id', biz.profile_id).single()
          .then(({ data: p }) => { if (p?.full_name) setBusinessContactName(p.full_name); });
      }

      setHasClaimed(true);
      setRedemptionStatus('claimed');
      setRedemptionId(redemption.id);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnclaim() {
    if (!creatorId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('redemptions').delete().eq('circuit_id', circuit.id).eq('creator_id', creatorId);
      if (error) throw error;
      setHasClaimed(false);
      setRedemptionStatus(null);
      setShowUnclaimModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const bookDateValid = !!(bookMonth && bookDay && bookYear);

  async function handleBooked() {
    if (!redemptionId || !bookDateValid) return;
    setBooking(true);
    try {
      const now = new Date().toISOString();
      const bookedNote = `${bookMonth.padStart(2, '0')}/${bookDay.padStart(2, '0')}/${bookYear}`;
      // Mark as booked. Reuse checked_in_at/status so the post-submission step
      // unlocks. (booked_note stores the day; attempted separately so a missing
      // column doesn't block the core transition.)
      const { error } = await supabase.from('redemptions')
        .update({ status: 'checked_in', checked_in_at: now })
        .eq('id', redemptionId);
      if (error) throw error;
      try {
        await supabase.from('redemptions').update({ booked_note: bookedNote }).eq('id', redemptionId);
      } catch { /* column may not exist yet — non-blocking */ }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRedemptionStatus('checked_in');
      setCheckedInAt(now);
      setShowBookModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  async function handleCheckIn() {
    if (!redemptionId) return;
    setCheckInLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Please allow location access to check in.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;
      const address = circuit.business?.address;
      if (address) {
        const geocoded = await Location.geocodeAsync(address);
        if (geocoded && geocoded.length > 0) {
          const { latitude: bizLat, longitude: bizLon } = geocoded[0];
          const distance = getDistanceMeters(latitude, longitude, bizLat, bizLon);
          if (distance > CHECK_IN_RADIUS_METERS) {
            Alert.alert(
              'Not close enough',
              `You need to be within ${CHECK_IN_RADIUS_METERS}m of the business to check in. You're currently ${Math.round(distance)}m away.\n\nIf you're confident you're at the right place, tap "I'm here".`,
              [
                { text: "I'm here", onPress: async () => {
                    setCheckInLoading(true);
                    try { await doCheckIn(); }
                    catch (e: any) { Alert.alert('Error', e.message); }
                    finally { setCheckInLoading(false); }
                  }
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
            return;
          }
        }
      }
      await doCheckIn();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCheckInLoading(false);
    }
  }

  async function doCheckIn() {
    if (!redemptionId) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('redemptions').update({
      checked_in_at: now.toISOString(),
      expires_at: expiresAt,
      status: 'checked_in',
    }).eq('id', redemptionId);
    if (error) throw error;
    trackEvent('checked_in', { redemption_id: redemptionId, circuit_title: circuit.title });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCheckedInAt(now.toISOString());
    setVoucherWindowEnd(expiresAt);
    setRedemptionStatus('checked_in');
  }

  const isVoucher = circuit.redemption_type === 'voucher';
  const allowedRanges = circuit.eligibility_min_followers
    ? circuit.eligibility_min_followers.split(',').map(r => r.trim())
    : [];

  // Which platform(s) the current requires
  const pf = circuit.platform_followers;
  const pfKeys = pf
    ? (['tiktok', 'instagram'] as const).filter(p => (pf[p]?.length ?? 0) > 0)
    : [];
  let postOnLabel = '';
  if (pfKeys.length === 2) postOnLabel = 'TikTok or IG';
  else if (pfKeys.length === 1) postOnLabel = pfKeys[0] === 'tiktok' ? 'TikTok' : 'Instagram';
  else if (circuit.required_platform) {
    postOnLabel = circuit.required_platform === 'tiktok' ? 'TikTok'
      : circuit.required_platform === 'instagram' ? 'Instagram'
      : 'TikTok or IG';
  }

  // Which required platform(s) the creator actually qualifies on
  const qualifyingPlatforms = pfKeys.filter(p => {
    const myRange = creatorFollowers[p];
    return !!myRange && (pf![p] ?? []).includes(myRange);
  });
  const eligiblePlatformLabel = qualifyingPlatforms
    .map(p => (p === 'tiktok' ? 'TikTok' : 'Instagram'))
    .join(' or ');
  const isExpired = circuit.expires_at ? new Date(circuit.expires_at) < new Date() : false;
  const daysUntilExpiry = circuit.expires_at
    ? Math.ceil((new Date(circuit.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const expiresSoon = !isExpired && daysUntilExpiry !== null && daysUntilExpiry <= 7;

  const postDeadlineStr = postDeadline
    ? new Date(postDeadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) +
      ' at ' + new Date(postDeadline).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;

  const minRedemption = redemptionId ? { id: redemptionId, circuit } : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Icon name="back" size={20} color={C.accent} />
        </TouchableOpacity>

        {isExpired && (
          <View style={styles.expiredBanner}>
            <Icon name="close" size={15} color="#92400E" />
            <Text style={styles.expiredBannerText}>This current has expired and is no longer accepting claims.</Text>
          </View>
        )}
        {expiresSoon && !hasClaimed && (
          <View style={styles.expiresSoonBanner}>
            <Icon name="bell" size={15} color="#92400E" />
            <Text style={styles.expiredBannerText}>
              {daysUntilExpiry === 1 ? 'Expires tomorrow — claim soon!' : `Expires in ${daysUntilExpiry} days`}
            </Text>
          </View>
        )}

        <Text style={styles.eyebrow}>HOSTED BY {circuit.business?.business_name}</Text>
        <Text style={styles.title}>{circuit.title}</Text>

        {circuit.description ? <Text style={styles.leadDesc}>{circuit.description}</Text> : null}

        {!hasClaimed && (
          <>
            {eligStatus !== null && (() => {
              const tone = eligStatus === 'eligible' ? C.ok : eligStatus === 'soon' ? C.accent : C.muted;
              const pillStyle = eligStatus === 'eligible' ? styles.eligPillOk : eligStatus === 'soon' ? styles.eligPillSoon : styles.eligPillNo;
              const iconName = eligStatus === 'eligible' ? 'check' : eligStatus === 'soon' ? 'bell' : 'close';
              const label = eligStatus === 'eligible'
                ? `You're eligible${eligiblePlatformLabel ? ` for ${eligiblePlatformLabel}` : ''}!`
                : eligStatus === 'soon'
                ? 'Opening to your follower tier soon'
                : 'Not eligible for this one';
              return (
                <TouchableOpacity
                  style={[styles.eligPill, pillStyle]}
                  onPress={() => setShowReqModal(true)}
                  activeOpacity={0.8}
                >
                  <Icon name={iconName} size={15} color={tone} />
                  <Text style={[styles.eligPillText, { color: tone }]}>{label}</Text>
                  <Icon name="arrow" size={14} color={tone} />
                </TouchableOpacity>
              );
            })()}

            <View style={styles.miniRow}>
              {circuit.guest_count != null && (
                <View style={styles.miniCard}>
                  <View style={styles.miniIcon}><Icon name="person" size={16} color={C.accent} /></View>
                  <Text style={styles.miniLabel}>COVERS</Text>
                  <Text style={styles.miniValue}>
                    {circuit.guest_count === 0 ? 'You only' : `You + ${circuit.guest_count} friend${circuit.guest_count > 1 ? 's' : ''}`}
                  </Text>
                </View>
              )}
              {postOnLabel ? (
                <View style={styles.miniCard}>
                  <View style={styles.miniIcon}><Icon name="film" size={16} color={C.accent} /></View>
                  <Text style={styles.miniLabel}>POST ON</Text>
                  <Text style={styles.miniValue}>{postOnLabel}</Text>
                </View>
              ) : null}
            </View>

            {circuit.event_link ? (
              <TouchableOpacity style={styles.eventCard} onPress={() => Linking.openURL(circuit.event_link!)} activeOpacity={0.8}>
                <Text style={styles.eventCardLabel}>View event page</Text>
                <View style={styles.eventCardOpen}>
                  <Text style={styles.eventCardOpenText}>Open</Text>
                  <Icon name="arrow" size={14} color={C.accent} />
                </View>
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {/* ── State 1: Claimed, not yet booked ── */}
        {hasClaimed && redemptionStatus === 'claimed' && (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>Yay, you're attending {circuit.title}!</Text>

            <View style={styles.stepRow}>
              <View style={styles.stepBullet}><Text style={styles.stepBulletText}>1</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>Grab tickets ASAP. Use this code at checkout on the event page:</Text>
                {assignedCode ? (
                  <TouchableOpacity
                    style={styles.codeBox}
                    activeOpacity={0.7}
                    onPress={async () => {
                      await Clipboard.setStringAsync(assignedCode);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setCodeCopied(true);
                      setTimeout(() => setCodeCopied(false), 1500);
                    }}
                  >
                    <Text style={styles.codeText}>{assignedCode}</Text>
                    <View style={styles.codeCopy}>
                      <Icon name={codeCopied ? 'check' : 'clipboard'} size={14} color={C.accent} />
                      <Text style={styles.codeCopyText}>{codeCopied ? 'Copied' : 'Copy'}</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.stepNote}>Your code will appear here shortly.</Text>
                )}
                {circuit.event_link ? (
                  <TouchableOpacity onPress={() => Linking.openURL(circuit.event_link!)} activeOpacity={0.7}>
                    <Text style={styles.eventLinkText}>Open event page →</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepBullet}><Text style={styles.stepBulletText}>2</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>Tap the button below to let us know what day you booked for.</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepBullet}><Text style={styles.stepBulletText}>3</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>Attend the event and have a great time!!!</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepBullet}><Text style={styles.stepBulletText}>4</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>Post your experience within 48 hours!</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── State 2a: Booked (code current) — attend & post ── */}
        {hasClaimed && redemptionStatus === 'checked_in' && !isVoucher && (
          <View style={[styles.stateBox, styles.stateBoxComplete]}>
            <Text style={[styles.stateTitle, { color: C.ok }]}>You're booked! 🎟️</Text>
            <Text style={styles.stepText}>
              Enjoy the event, then post your video review within 48 hours and submit the link below.
            </Text>
          </View>
        )}

        {/* ── State 2: Checked in — show voucher ── */}
        {hasClaimed && redemptionStatus === 'checked_in' && isVoucher && (
          <View style={styles.voucherBox}>
            <View style={styles.voucherTopRow}>
              <View style={styles.voucherIcon}>
                <Icon name="lock" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.voucherBoxTitle}>In-Person Voucher</Text>
                <Text style={styles.voucherBoxSub}>Show this to staff when you arrive</Text>
              </View>
              <View style={styles.voucherValidBadge}>
                <View style={styles.voucherValidDot} />
                <Text style={styles.voucherValidText}>VALID</Text>
              </View>
            </View>

            {circuit.description ? (
              <Text style={styles.voucherBoxDesc}>{circuit.description}</Text>
            ) : null}

            <View style={styles.voucherMeta}>
              {creatorName ? (
                <>
                  <View style={styles.voucherMetaRow}>
                    <Text style={styles.voucherMetaLabel}>CREATOR</Text>
                    <Text style={styles.voucherMetaValue}>{creatorName}</Text>
                  </View>
                  <View style={styles.voucherMetaSep} />
                </>
              ) : null}
              {businessContactName ? (
                <>
                  <View style={styles.voucherMetaRow}>
                    <Text style={styles.voucherMetaLabel}>POINT OF CONTACT</Text>
                    <Text style={styles.voucherMetaValue}>{businessContactName}</Text>
                  </View>
                  <View style={styles.voucherMetaSep} />
                </>
              ) : null}
              {redemptionId ? (
                <>
                  <View style={styles.voucherMetaRow}>
                    <Text style={styles.voucherMetaLabel}>REF</Text>
                    <Text style={styles.voucherRefValue}>{formatRef(redemptionId)}</Text>
                  </View>
                  <View style={styles.voucherMetaSep} />
                </>
              ) : null}
              <View style={styles.voucherTimerRow}>
                <View style={styles.voucherLiveDot} />
                <Text style={styles.voucherLiveText}>Live</Text>
                <Text style={[styles.voucherTimerText, voucherExpired && styles.voucherExpired]}>
                  {voucherExpired ? 'EXPIRED' : voucherRemaining}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── State 3: Redeemed — 48hr post timer ── */}
        {hasClaimed && redemptionStatus === 'completed' && !hasPost && (() => {
          const totalMs = 48 * 60 * 60 * 1000;
          const elapsedMs = checkedInAt ? Date.now() - new Date(checkedInAt).getTime() : 0;
          const progress = Math.min(1, Math.max(0, elapsedMs / totalMs));
          const [hLeft, mLeft] = postDeadline
            ? [Math.floor(Math.max(0, new Date(postDeadline).getTime() - Date.now()) / 3600000),
               Math.floor((Math.max(0, new Date(postDeadline).getTime() - Date.now()) % 3600000) / 60000)]
            : [0, 0];
          return (
            <View style={[styles.postBox, postExpired && styles.postBoxOverdue]}>
              <View style={styles.postBoxTopRow}>
                <View style={[styles.postBoxIcon, postExpired && styles.postBoxIconOverdue]}>
                  <Icon name="film" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.postBoxTitle, postExpired && { color: '#991B1B' }]}>
                    {postExpired ? 'Post overdue' : 'Pending video post'}
                  </Text>
                  <Text style={styles.postBoxSub}>Last step to complete this current</Text>
                </View>
              </View>
              <Text style={[styles.postBoxBody, postExpired && { color: '#B91C1C' }]}>
                {postExpired
                  ? `Your deadline${postDeadlineStr ? ` (${postDeadlineStr})` : ''} has passed. Post now to avoid a strike.`
                  : `Post by ${postDeadlineStr ?? '48 hours after check-in'} to stay in good standing.`}
              </Text>
              {!postExpired && (
                <>
                  <View style={styles.postBoxTimerRow}>
                    <Icon name="clock" size={12} color={C.accent} />
                    <Text style={styles.postBoxTimerLabel}>TIME LEFT</Text>
                    <Text style={styles.postBoxTimerValue}>{hLeft}h {mLeft}m</Text>
                  </View>
                  <View style={styles.postBoxBarBg}>
                    <View style={[styles.postBoxBarFill, { width: `${(1 - progress) * 100}%` as any }]} />
                  </View>
                </>
              )}
            </View>
          );
        })()}

        {/* ── State 4: Complete ── */}
        {hasClaimed && redemptionStatus === 'completed' && hasPost && (
          <View style={[styles.stateBox, styles.stateBoxComplete]}>
            <Text style={[styles.stateTitle, { color: C.ok }]}>Completed ✓</Text>
            <Text style={styles.stepText}>
              You've visited, redeemed, and posted. This current is fully complete — thanks for being a great creator!
            </Text>
          </View>
        )}

        {circuit.creator_notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes from the business</Text>
            <Text style={styles.offeringText}>{circuit.creator_notes}</Text>
          </View>
        ) : null}


        {hasClaimed && redemptionStatus === 'claimed' && (
          <>
            <TouchableOpacity
              style={styles.unclaimBtn}
              onPress={() => Linking.openURL(`mailto:hello@localcurrentapp.com?subject=${encodeURIComponent(`Issue with "${circuit.title}"`)}`)}
            >
              <Text style={styles.unclaimBtnText}>Report an issue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.unclaimBtn} onPress={() => setShowUnclaimModal(true)}>
              <Text style={styles.unclaimBtnText}>Unclaim</Text>
            </TouchableOpacity>
          </>
        )}

        {hasClaimed && (redemptionStatus === 'checked_in' || redemptionStatus === 'completed') && !problemReportedAt && (
          <TouchableOpacity style={styles.unclaimBtn} onPress={() => setShowReport(true)}>
            <Text style={styles.unclaimBtnText}>Report a problem</Text>
          </TouchableOpacity>
        )}
        {problemReportedAt && (
          <View style={styles.reportedNote}>
            <Icon name="check" size={12} color={C.muted2} />
            <Text style={styles.reportedNoteText}>Problem reported — our team is reviewing</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Footer CTA ── */}
      <View style={styles.footer}>
        {role === 'business' ? (
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>This opp is only available to Creators</Text>
          </View>
        ) : hasClaimed && redemptionStatus === 'claimed' ? (
          <TouchableOpacity style={styles.button} onPress={() => setShowBookModal(true)}>
            <Text style={styles.buttonText}>I booked tickets on…</Text>
          </TouchableOpacity>
        ) : hasClaimed && redemptionStatus === 'checked_in' ? (
          <TouchableOpacity
            style={styles.button}
            onPress={() => minRedemption && navigation.navigate('SubmitPost', { redemption: minRedemption })}
          >
            <Text style={styles.buttonText}>Submit post</Text>
          </TouchableOpacity>
        ) : hasClaimed && redemptionStatus === 'completed' && !hasPost ? (
          <TouchableOpacity
            style={[styles.button, postExpired && { backgroundColor: '#DC2626' }]}
            onPress={() => minRedemption && navigation.navigate('SubmitPost', { redemption: minRedemption })}
          >
            <Text style={styles.buttonText}>Submit post</Text>
          </TouchableOpacity>
        ) : hasClaimed ? null
        : isFull ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>No spots left</Text>
            <Text style={styles.ineligibleSub}>All creator spots for this current have been claimed</Text>
          </View>
        ) : isExpired ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>This current has expired</Text>
            <Text style={styles.ineligibleSub}>The business can no longer accept new claims</Text>
          </View>
        ) : eligStatus === 'soon' ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>Opening to your follower tier soon</Text>
            <Text style={styles.ineligibleSub}>This current opens to larger accounts first, then expands to your tier. Check back soon!</Text>
          </View>
        ) : eligible === false ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>You're not eligible for this opp</Text>
            <Text style={styles.ineligibleSub}>Your follower range or niche doesn't match the requirements</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => creatorStatus === 'pending' ? setShowPendingModal(true) : setShowClaimModal(true)}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Claim this current</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pending verification modal */}
      <Modal visible={showPendingModal} transparent animationType="fade" onRequestClose={() => setShowPendingModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPendingModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <View style={styles.pendingIconWrap}>
              <Icon name="bell" size={28} color={C.accent} />
            </View>
            <Text style={styles.modalTitle}>Your account is being verified</Text>
            <Text style={styles.modalBody}>
              Our team is reviewing your profile. Once approved you'll be able to claim currents and start creating content for local businesses.{'\n\n'}You'll get a notification as soon as you're in.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => setShowPendingModal(false)}>
              <Text style={styles.buttonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Claim modal */}
      <Modal visible={showClaimModal} transparent animationType="fade" onRequestClose={() => setShowClaimModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowClaimModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>You sure?</Text>

            <View style={styles.claimRow}>
              <View style={styles.claimRowIcon}><Icon name="switch" size={16} color={C.accent} /></View>
              <Text style={styles.claimRowText}>
                <Text style={styles.claimBold}>You'll get a redemption code</Text> for free tickets to the event.
              </Text>
            </View>
            <View style={styles.claimRow}>
              <View style={styles.claimRowIcon}><Icon name="pin" size={16} color={C.accent} /></View>
              <Text style={styles.claimRowText}>
                Double check the <Text style={styles.claimBold}>date, time, and location</Text> before confirming.
              </Text>
            </View>
            <View style={styles.claimRow}>
              <View style={styles.claimRowIcon}><Icon name="film" size={16} color={C.accent} /></View>
              <Text style={styles.claimRowText}>
                Publish your video review <Text style={styles.claimBold}>within 48 hours</Text> of the event.
              </Text>
            </View>

            <View style={styles.claimWarnBox}>
              <Icon name="close" size={14} color="#B91C1C" />
              <Text style={styles.claimWarnText}>
                No-shows or skipping the post can get you removed from the app.
              </Text>
            </View>
            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={() => { setShowClaimModal(false); handleClaim(); }} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Claiming…' : 'I understand, claim this current'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowClaimModal(false)}>
              <Text style={styles.modalCancelText}>Never mind</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unclaim modal */}
      <Modal visible={showUnclaimModal} transparent animationType="fade" onRequestClose={() => setShowUnclaimModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !loading && setShowUnclaimModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Are you sure?</Text>
            <Text style={styles.modalBody}>
              This will increase your chances of being removed from the app. By unclaiming, you're freeing this spot for another creator.
            </Text>
            <TouchableOpacity style={[styles.unclaimConfirmBtn, loading && styles.buttonDisabled]} onPress={handleUnclaim} disabled={loading}>
              <Text style={styles.unclaimConfirmBtnText}>{loading ? 'Unclaiming…' : 'Yes, unclaim'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowUnclaimModal(false)}>
              <Text style={styles.modalCancelText}>Nevermind</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {redemptionId && (
        <ReportModal visible={showReport} redemptionId={redemptionId} onClose={() => setShowReport(false)} />
      )}

      {/* Booked-day modal */}
      <Modal visible={showBookModal} transparent animationType="fade" onRequestClose={() => setShowBookModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !booking && setShowBookModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Sweet! Which day are you attending the event?</Text>
            <View style={styles.bookDateRow}>
              <TextInput
                style={[styles.bookInput, styles.bookDateMonth]}
                value={bookMonth}
                onChangeText={t => setBookMonth(t.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="MM"
                placeholderTextColor={C.muted2}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TextInput
                style={[styles.bookInput, styles.bookDateDay]}
                value={bookDay}
                onChangeText={t => setBookDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="DD"
                placeholderTextColor={C.muted2}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TextInput
                style={[styles.bookInput, styles.bookDateYear]}
                value={bookYear}
                onChangeText={t => setBookYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="YYYY"
                placeholderTextColor={C.muted2}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
            <TouchableOpacity
              style={[styles.button, (!bookDateValid || booking) && styles.buttonDisabled]}
              onPress={handleBooked}
              disabled={!bookDateValid || booking}
            >
              <Text style={styles.buttonText}>{booking ? 'Saving…' : 'Confirm'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowBookModal(false)}>
              <Text style={styles.modalCancelText}>Never mind</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Requirements detail modal */}
      <Modal visible={showReqModal} transparent animationType="fade" onRequestClose={() => setShowReqModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowReqModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Requirements</Text>
            {pfKeys.length > 1 && (
              <Text style={styles.eitherNote}>You only need to qualify on one platform.</Text>
            )}
            {pfKeys.length > 0 ? (
              pfKeys.map(p => {
                const ranges = pf![p] ?? [];
                const myRange = creatorFollowers[p];
                const met = !!myRange && ranges.includes(myRange);
                return (
                  <View key={p} style={styles.requirementRow}>
                    <View style={styles.requirementLabelRow}>
                      <Text style={styles.requirementLabel}>{p === 'tiktok' ? 'TIKTOK FOLLOWERS' : 'INSTAGRAM FOLLOWERS'}</Text>
                      {myRange ? (
                        <Text style={met ? styles.requirementMet : styles.requirementUnmet}>
                          {met ? `✓ You have ${myRange}` : `✗ You have ${myRange}`}
                        </Text>
                      ) : (
                        <Text style={styles.requirementUnmet}>✗ You're not on {p === 'tiktok' ? 'TikTok' : 'Instagram'}</Text>
                      )}
                    </View>
                    <View style={styles.chipRow}>
                      {ranges.map(r => (
                        <View key={r} style={styles.chip}><Text style={styles.chipText}>{r}</Text></View>
                      ))}
                    </View>
                  </View>
                );
              })
            ) : allowedRanges.length > 0 ? (
              <View style={styles.requirementRow}>
                <View style={styles.requirementLabelRow}>
                  <Text style={styles.requirementLabel}>FOLLOWER COUNT</Text>
                  {creatorFollowerRange ? (
                    <Text style={allowedRanges.includes(creatorFollowerRange) ? styles.requirementMet : styles.requirementUnmet}>
                      {allowedRanges.includes(creatorFollowerRange) ? `✓ You have ${creatorFollowerRange}` : `✗ You have ${creatorFollowerRange}`}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.chipRow}>
                  {allowedRanges.map(r => (
                    <View key={r} style={styles.chip}><Text style={styles.chipText}>{r}</Text></View>
                  ))}
                </View>
              </View>
            ) : null}
            {circuit.eligibility_niches?.length > 0 && (
              <View style={styles.requirementRow}>
                <View style={styles.requirementLabelRow}>
                  <Text style={styles.requirementLabel}>NICHE</Text>
                  {creatorNiches.length > 0 && (
                    <Text style={creatorNiches.some(n => circuit.eligibility_niches.includes(n)) ? styles.requirementMet : styles.requirementUnmet}>
                      {creatorNiches.some(n => circuit.eligibility_niches.includes(n)) ? '✓ Matches your niches' : "✗ Doesn't match"}
                    </Text>
                  )}
                </View>
                <View style={styles.chipRow}>
                  {circuit.eligibility_niches.map(n => (
                    <View key={n} style={styles.chip}><Text style={styles.chipText}>{n}</Text></View>
                  ))}
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowReqModal(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  scroll: { padding: 24 },
  back: { marginBottom: 20 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.4, color: C.accent, textTransform: 'uppercase', marginBottom: 6 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 26, letterSpacing: -0.4, color: C.ink, marginBottom: 12 },
  leadDesc: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 22, marginBottom: 20 },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.paper, borderWidth: 1.5, borderColor: C.accent, borderStyle: 'dashed',
    borderRadius: R.md, paddingVertical: 12, paddingHorizontal: 14, marginTop: 8, marginBottom: 8,
  },
  codeText: { fontFamily: F.monoBold, fontSize: 20, letterSpacing: 2, color: C.accent },
  codeCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  codeCopyText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  eventLinkText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent, marginTop: 2 },
  bookDateRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  bookInput: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.paper, textAlign: 'center',
  },
  bookDateMonth: { flex: 1 },
  bookDateDay: { flex: 1 },
  bookDateYear: { flex: 1.4 },

  eligPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 11, marginBottom: 20,
  },
  eligPillOk: { backgroundColor: C.okSoft },
  eligPillSoon: { backgroundColor: C.accentTint },
  eligPillNo: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line2 },
  eligPillText: { fontFamily: F.display, fontWeight: '700', fontSize: 15 },

  miniRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  miniCard: {
    flex: 1, backgroundColor: C.card, borderRadius: R.lg, padding: 16,
    borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  miniIcon: {
    width: 36, height: 36, borderRadius: R.md, backgroundColor: C.accentTint,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  miniLabel: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.muted2, textTransform: 'uppercase', marginBottom: 3 },
  miniValue: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink },

  eventCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: R.lg, padding: 18,
    borderWidth: 1, borderColor: C.line, marginBottom: 4, ...(S.card as any),
  },
  eventCardLabel: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink },
  eventCardOpen: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventCardOpenText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent },
  // State boxes
  stateBox: { backgroundColor: C.accentTint, borderRadius: R.lg, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: C.accentSoft },
  stateBoxComplete: { backgroundColor: C.okSoft, borderColor: C.ok + '44' },
  stateTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.accent, marginBottom: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  stepBullet: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepBulletText: { fontFamily: F.monoBold, color: '#fff', fontSize: 11 },
  stepText: { fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 20 },
  stepNote: { fontFamily: F.body, fontSize: 12, color: C.muted, lineHeight: 17, marginTop: 4, fontStyle: 'italic' },
  // Voucher (checked_in state)
  voucherBox: { backgroundColor: C.accentTint, borderRadius: R.md, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.accentSoft },
  voucherTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  voucherIcon: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  voucherBoxTitle: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  voucherBoxSub: { fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 2 },
  voucherValidBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.okSoft, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4, marginTop: 2 },
  voucherValidDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.ok },
  voucherValidText: { fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1, color: C.ok },
  voucherBoxDesc: { fontFamily: F.body, fontSize: 13, color: C.inkSoft, lineHeight: 19, marginBottom: 12 },
  voucherMeta: { borderTopWidth: 1, borderTopColor: C.accentSoft, paddingTop: 12 },
  voucherMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  voucherMetaSep: { height: 1, backgroundColor: C.accentSoft },
  voucherMetaLabel: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.muted2, textTransform: 'uppercase' },
  voucherMetaValue: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  voucherRefValue: { fontFamily: F.monoBold, fontSize: 14, color: C.ink, letterSpacing: 1.5 },
  voucherTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  voucherLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok },
  voucherLiveText: { fontFamily: F.body, fontSize: 13, color: C.muted },
  voucherTimerText: { fontFamily: F.monoBold, fontSize: 15, color: C.ink, letterSpacing: 2 },
  voucherExpired: { color: '#DC2626' },
  // Post timer (completed, no post)
  postBox: { backgroundColor: C.accentTint, borderRadius: R.md, padding: 14, marginBottom: 16 },
  postBoxOverdue: { backgroundColor: '#FEF2F2' },
  postBoxTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  postBoxIcon: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  postBoxIconOverdue: { backgroundColor: '#DC2626' },
  postBoxTitle: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  postBoxSub: { fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 2 },
  postBoxBody: { fontFamily: F.body, fontSize: 13, color: C.inkSoft, lineHeight: 19, marginBottom: 10 },
  postBoxTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  postBoxTimerLabel: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.muted2, textTransform: 'uppercase', flex: 1 },
  postBoxTimerValue: { fontFamily: F.monoBold, fontSize: 13, color: C.accent },
  postBoxBarBg: { height: 4, backgroundColor: C.line2, borderRadius: 2, overflow: 'hidden' },
  postBoxBarFill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  // Details section
  section: { backgroundColor: C.card, borderRadius: R.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.line, ...(S.card as any) },
  sectionTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 14, color: C.ink, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' },
  offeringRow: { marginBottom: 12 },
  offeringText: { fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 20, marginTop: 4 },
  detailLabel: { fontFamily: F.body, fontSize: 14, color: C.muted },
  detailValue: { fontFamily: F.bodyMedium, fontSize: 14, color: C.ink },
  detailLink: { color: C.accent, textDecorationLine: 'underline' },
  detailValueRight: { flex: 1, textAlign: 'right', marginLeft: 16 },
  eitherNote: { fontFamily: F.bodyMedium, fontSize: 13, color: C.accent, marginBottom: 12 },
  requirementRow: { marginBottom: 12 },
  requirementLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  requirementLabel: { fontFamily: F.mono, fontSize: 11, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.8 },
  requirementMet: { fontFamily: F.bodySemi, fontSize: 12, color: C.ok },
  requirementUnmet: { fontFamily: F.bodySemi, fontSize: 12, color: '#DC2626' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.paper },
  chipText: { fontFamily: F.bodyMedium, fontSize: 12, color: C.muted },
  platformRequirementRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4, backgroundColor: C.accentTint, borderRadius: R.sm, padding: 12 },
  platformRequiredValue: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent, marginTop: 2, textTransform: 'capitalize' },
  requiredBadge: { backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  requiredBadgeText: { fontFamily: F.monoBold, fontSize: 10.5, color: '#fff', letterSpacing: 0.6 },
  // Footer
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: C.line },
  button: { backgroundColor: C.accent, borderRadius: R.btn, padding: 16, alignItems: 'center', ...(S.button as any) },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  infoNote: { backgroundColor: C.accentTint, borderRadius: R.md, padding: 16, alignItems: 'center' },
  infoNoteText: { fontFamily: F.bodyMedium, color: C.accent, fontSize: 14 },
  ineligibleNote: { backgroundColor: '#FEF2F2', borderRadius: R.md, padding: 16, alignItems: 'center' },
  ineligibleText: { fontFamily: F.bodySemi, color: '#991B1B', fontSize: 15 },
  ineligibleSub: { fontFamily: F.body, color: '#EF4444', fontSize: 13, marginTop: 4, textAlign: 'center' },
  // Unclaim / report links
  unclaimBtn: { alignItems: 'center', paddingVertical: 16 },
  unclaimBtnText: { fontFamily: F.body, color: C.muted2, fontSize: 13, textDecorationLine: 'underline' },
  unclaimConfirmBtn: { backgroundColor: '#EF4444', borderRadius: R.btn, padding: 16, alignItems: 'center' },
  unclaimConfirmBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  reportedNote: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', paddingVertical: 10 },
  reportedNoteText: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalBox: { backgroundColor: C.card, borderRadius: R.lg, padding: 28, width: '100%', ...(S.menu as any) },
  modalTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink, marginBottom: 12 },
  modalBody: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 23, marginBottom: 24 },
  claimRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  claimRowIcon: {
    width: 32, height: 32, borderRadius: R.sm, backgroundColor: C.accentTint,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  claimRowText: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, lineHeight: 22 },
  claimBold: { fontFamily: F.bodySemi, color: C.ink },
  claimWarnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: R.md, padding: 12,
    marginTop: 8, marginBottom: 20,
  },
  claimWarnText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 13.5, color: '#B91C1C', lineHeight: 19 },
  modalCancel: { alignItems: 'center', marginTop: 14 },
  modalCancelText: { fontFamily: F.body, color: C.muted2, fontSize: 14 },
  modalWarningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF3C7', borderRadius: R.sm, padding: 12, borderWidth: 1, borderColor: '#FCD34D', marginBottom: 20 },
  modalWarningText: { fontFamily: F.bodyMedium, fontSize: 13, color: '#92400E', flex: 1, lineHeight: 18 },
  pendingIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  expiredBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF3C7', borderRadius: R.md, padding: 14, borderWidth: 1, borderColor: '#FCD34D', marginBottom: 18 },
  expiredBannerText: { fontFamily: F.bodyMedium, fontSize: 13.5, color: '#92400E', flex: 1, lineHeight: 19 },
  expiresSoonBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: R.md, padding: 14, borderWidth: 1, borderColor: '#FCD34D', marginBottom: 18 },
} as any);
