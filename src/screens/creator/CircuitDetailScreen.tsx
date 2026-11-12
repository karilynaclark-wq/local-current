import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, Modal, Linking, TextInput,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { Circuit } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import { RatingModal, Stars } from '../../components/Reviews';
import { notifyUser } from '../../lib/notifications';
import { trackEvent } from '../../lib/analytics';
import { isEligibleForCircuit, currentlyEligibleRanges, creatorFollowersByPlatform, eligibilityStatus, creatorFollowerCounts, minFollowersLabel, type PlatformCountMap } from '../../lib/eligibility';
import { getConnections } from '../../lib/socialConnect';

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

const REPORT_OPTIONS = [
  { value: 'not_honored', label: "Business didn't honor the ticket code" },
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
    // The admin is emailed by the database (send-email 'problem').
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
  const [creatorCounts, setCreatorCounts] = useState<PlatformCountMap>({});
  const [showReqModal, setShowReqModal] = useState(false);
  // The ticket code handed out on claim (older claims: free-text access details).
  const [accessDetails, setAccessDetails] = useState<string | null>(null);
  const [detailsCopied, setDetailsCopied] = useState(false);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  // Date the creator booked for (events have no fixed date); anchors the 48h post window.
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookMonth, setBookMonth] = useState('');
  const [bookDay, setBookDay] = useState('');
  const [creatorNiches, setCreatorNiches] = useState<string[]>([]);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligStatus, setEligStatus] = useState<'eligible' | 'soon' | 'no' | null>(null);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [redemptionStatus, setRedemptionStatus] = useState<string | null>(null);
  const [redemptionId, setRedemptionId] = useState<string | null>(null);
  const [hasPost, setHasPost] = useState(false);
  const [myReview, setMyReview] = useState<{ rating: number | null; note: string | null; anonymous: boolean | null } | null>(null);
  const [showRate, setShowRate] = useState(false);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [voucherWindowEnd, setVoucherWindowEnd] = useState<string | null>(null);
  const [problemReportedAt, setProblemReportedAt] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<'code' | 'guest_list' | 'email' | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [myEmail, setMyEmail] = useState('');
  const [otherEvents, setOtherEvents] = useState<Circuit[]>([]);
  const [goingOn, setGoingOn] = useState<string | null>(null);
  const [respondedAt, setRespondedAt] = useState<string | null>(null);
  const [ticketsSentAt, setTicketsSentAt] = useState<string | null>(null);
  const [showDates, setShowDates] = useState(false);
  const [pickDates, setPickDates] = useState<Date[]>([]);
  const [prefNote, setPrefNote] = useState('');
  const isRecurring = circuit.schedule_type === 'recurring';
  const isManual = circuit.approval_mode === 'manual';
  // Accepting an invite depends on how tickets are delivered.
  const acceptLabel = (m: string | null) => m === 'code' ? 'I got my tickets with the code' : 'Accept invite';
  const ticketCount = (circuit.guest_count ?? 1) + 1;
  const ticketsLabel = ticketCount === 1 ? '1 free ticket' : `${ticketCount} free tickets`;

  const postDeadline = checkedInAt
    ? new Date(new Date(checkedInAt).getTime() + 48 * 60 * 60 * 1000).toISOString()
    : null;
  const { expired: voucherExpired } = useCountdown(voucherWindowEnd);
  const { remaining: postRemaining, expired: postExpired } = useCountdown(postDeadline);

  // Auto-redeem when the 4-hour check-in window closes
  useEffect(() => {
    if (voucherExpired && redemptionStatus === 'checked_in' && redemptionId) {
      supabase.from('redemptions')
        .update({ redeemed_at: new Date().toISOString(), status: 'completed' })
        .eq('id', redemptionId)
        .then(() => {
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
            .select('id, status, checked_in_at, expires_at, problem_reported_at, access_details, code, requested_at, claimed_at, delivery_method, confirmed_at, responded_at, going_on, tickets_sent_at, creator_rating, creator_review, creator_review_anonymous')
            .eq('circuit_id', circuit.id)
            .eq('creator_id', creator.id)
            .limit(1).single()
            .then(({ data: existing }) => {
              if (existing) {
                setHasClaimed(true);
                setRedemptionStatus(existing.status ?? null);
                setRedemptionId(existing.id);
                setMyReview({ rating: existing.creator_rating ?? null, note: existing.creator_review ?? null, anonymous: existing.creator_review_anonymous ?? null });
                setCheckedInAt(existing.checked_in_at ?? null);
                setProblemReportedAt(existing.problem_reported_at ?? null);
                if (existing.checked_in_at) {
                  setVoucherWindowEnd(new Date(new Date(existing.checked_in_at).getTime() + 4 * 60 * 60 * 1000).toISOString());
                }
                setAccessDetails(existing.code ?? existing.access_details ?? null);
                setRequestedAt(existing.requested_at ?? existing.claimed_at ?? null);
                setDeliveryMethod(existing.delivery_method ?? null);
                setConfirmedAt(existing.confirmed_at ?? null);
                setGoingOn(existing.going_on ?? null);
                setRespondedAt(existing.responded_at ?? null);
                setTicketsSentAt(existing.tickets_sent_at ?? null);
                supabase.from('posts').select('id', { count: 'exact', head: true }).eq('redemption_id', existing.id)
                  .then(({ count }) => setHasPost((count ?? 0) > 0));
              }
            });
        });
    });
  }

  useFocusEffect(useCallback(() => { fetchRedemptionStatus(); }, []));

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyEmail(user?.email ?? ''));
  }, []);

  // "Not this time" / released: suggest other open events
  useEffect(() => {
    if (!['declined', 'expired'].includes(redemptionStatus ?? '')) return;
    supabase.from('circuits').select('*, business:businesses(business_name, address)')
      .eq('is_active', true).neq('id', circuit.id).order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setOtherEvents((data ?? []) as Circuit[]));
  }, [redemptionStatus]);

  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  async function handleRequest() {
    if (isRecurring && !pickDates.length) { Alert.alert('Pick your dates', 'Choose up to 3 dates that work for you.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.rpc('request_current', {
        p_circuit_id: circuit.id,
        p_dates: isRecurring ? pickDates.map(ymd) : null,
        p_note: isRecurring ? prefNote : null,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent('circuit_requested', { circuit_id: circuit.id, business_id: circuit.business_id });
      fetchRedemptionStatus();
      setHasClaimed(true);
      setRedemptionStatus('requested');
      setShowDates(false);
    } catch (e: any) {
      Alert.alert('Could not send', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function notifyBusiness(title: string, body: string) {
    const { data: biz } = await supabase.from('businesses').select('profile_id').eq('id', circuit.business_id).single();
    if (biz?.profile_id) notifyUser(biz.profile_id, title, body, { url: `localcurrent://manage/${circuit.id}` });
  }

  async function handleConfirm() {
    if (!redemptionId) return;
    setConfirming(true);
    const { error } = await supabase.rpc('confirm_tickets', { p_redemption_id: redemptionId });
    setConfirming(false);
    if (error) { Alert.alert('Error', error.message); fetchRedemptionStatus(); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    trackEvent('tickets_confirmed', { circuit_id: circuit.id, method: deliveryMethod });
    setConfirmedAt(new Date().toISOString());
    notifyBusiness('Invite accepted ✅', `${creatorName || 'A creator'} accepted your invite to ${circuit.title}${goingStr ? ` on ${goingStr}` : ''}.`);
    // Guest list / email: nothing to buy, so they're set once confirmed.
    // Date known → confirming is the only step (no separate "I got my tickets").
    if (eventAt || goingDate) handleBooked();
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
        .then(({ data }) => {
          setRole(data?.role ?? null);
          if (data?.full_name) setCreatorName(data.full_name);
          if (data?.role === 'creator') {
            supabase.from('creators').select('id, follower_range, niche, status, main_platform, secondary_platform, secondary_follower_range').eq('profile_id', user.id).single()
              .then(async ({ data: creator }) => {
                if (!creator) return;
                setCreatorId(creator.id);
                setCreatorStatus(creator.status ?? null);
                const range = creator.follower_range ?? '';
                const niches = creator.niche ? creator.niche.split(',').map((n: string) => n.trim()) : [];
                const followers = creatorFollowersByPlatform(creator);
                setCreatorFollowerRange(range);
                setCreatorFollowers(followers);
                setCreatorNiches(niches);
                const counts = creatorFollowerCounts(followers, await getConnections().catch(() => []));
                setCreatorCounts(counts);
                setEligible(isEligibleForCircuit(circuit, range, niches, followers, counts));
                setEligStatus(eligibilityStatus(circuit, range, niches, followers, counts));
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

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: recentRequests } = await supabase
        .from('redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', creator.id)
        .gte('claimed_at', fifteenMinutesAgo);
      if ((recentRequests ?? 0) > 0) {
        Alert.alert('Slow down', 'You can only claim one current every 15 minutes. Come back shortly!');
        return;
      }

      // Server-side claim: checks spots + event date and hands out the code.
      const { data: code, error } = await supabase.rpc('claim_current', { p_circuit_id: circuit.id });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent('circuit_claimed', { circuit_id: circuit.id, circuit_title: circuit.title, business_id: circuit.business_id });

      const { data: biz } = await supabase.from('businesses').select('profile_id').eq('id', circuit.business_id).single();
      if (biz?.profile_id) {
        notifyUser(biz.profile_id, 'Tickets claimed 🎟️', `${creatorName || 'A creator'} claimed tickets to "${circuit.title}".`);
      }

      fetchRedemptionStatus();
      setHasClaimed(true);
      setRedemptionStatus('approved');
      setAccessDetails(code ?? null);
    } catch (e: any) {
      trackEvent('claim_failed', { circuit_id: circuit.id, error: e.message });
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!redemptionId) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('withdraw_request', { p_redemption_id: redemptionId });
      if (error) throw error;
      trackEvent('claim_withdrawn', { circuit_id: circuit.id });
      if (isManual && redemptionStatus === 'approved') {
        notifyBusiness('A spot opened up', `${creatorName || 'A creator'} can't make ${circuit.title} anymore. Pick someone else.`);
      }
      setRedemptionStatus('cancelled');
      setShowUnclaimModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }


  /** The booked day at 9 PM local; rolls into next year if the date already passed by >1 week. */
  function bookedDate(): Date | null {
    const m = +bookMonth, d = +bookDay;
    if (!m || !d || m > 12 || d > 31) return null;
    const now = new Date();
    let date = new Date(now.getFullYear(), m - 1, d, 21, 0);
    if (date.getMonth() !== m - 1) return null;
    if (date.getTime() < now.getTime() - 7 * 86_400_000) date = new Date(now.getFullYear() + 1, m - 1, d, 21, 0);
    return date;
  }

  async function handleBooked() {
    if (!redemptionId) return;
    const visit = eventAt ?? goingDate ?? bookedDate();
    if (!visit) { Alert.alert('Pick a date', 'Enter the month and day you booked for.'); return; }
    setBooking(true);
    try {
      // The 48h posting window (app + server reminders) runs from checked_in_at,
      // so anchor it to the day they're going rather than when they bought tickets.
      const now = visit.toISOString();
      const bookedNote = visit.toLocaleDateString('en-US');
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
      trackEvent('tickets_booked', { circuit_id: circuit.id });
      setRedemptionStatus('checked_in');
      setCheckedInAt(now);
      setShowBookModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  const allowedRanges = circuit.eligibility_min_followers
    ? circuit.eligibility_min_followers.split(',').map(r => r.trim())
    : [];

  // Minimum following: stored on new currents; older ones use their lowest tier.
  const TIER_FLOOR: Record<string, number> = {
    'Under 1K': 0, '1K–5K': 1_000, '5K–10K': 5_000, '10K–50K': 10_000, '50K–100K': 50_000, '100K+': 100_000,
  };
  const legacyRanges = [
    ...allowedRanges,
    ...Object.values(circuit.platform_followers ?? {}).flat() as string[],
  ];
  const effectiveMin: number | null = circuit.min_followers ?? (legacyRanges.length
    ? Math.min(...legacyRanges.map(r => TIER_FLOOR[r] ?? 0)) : null);

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
  const eventAt = circuit.event_at ? new Date(circuit.event_at) : null;
  // Recurring "You pick": the date the business confirmed (9 PM local anchors the post window)
  const goingDate = goingOn ? new Date(`${goingOn}T21:00:00`) : null;
  // Same rule as the server: 72h, or 6h before the event if sooner (min 3h after approval).
  const confirmBy = (() => {
    if (!respondedAt) return null;
    const resp = new Date(respondedAt).getTime(), H = 3_600_000;
    const start = eventAt ? eventAt.getTime() : goingDate ? goingDate.getTime() - 9 * H : null;
    let t = resp + 72 * H;
    if (start != null) t = Math.min(t, Math.max(resp + 3 * H, start - 6 * H));
    return new Date(t);
  })();
  const confirmByStr = confirmBy
    ? confirmBy.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '72 hours';
  const goingStr = goingDate ? goingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : null;
  const eventDateStr = eventAt
    ? eventAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' + eventAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;
  const daysToEvent = eventAt
    ? Math.round((new Date(eventAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
    : null;
  // "West Loop" from an address like "123 Main St, West Loop, Chicago"
  const addrParts = (circuit.business?.address ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const neighborhood = addrParts.length >= 3 ? addrParts[addrParts.length - 2] : null;
  const isExpired = (circuit.expires_at ? new Date(circuit.expires_at) < new Date() : false)
    || (eventAt ? eventAt < new Date() : false);
  const daysUntilExpiry = circuit.expires_at
    ? Math.ceil((new Date(circuit.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const expiresSoon = !isExpired && daysUntilExpiry !== null && daysUntilExpiry <= 7;

  const postDeadlineStr = postDeadline
    ? new Date(postDeadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) +
      ' at ' + new Date(postDeadline).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;

  const minRedemption = redemptionId ? { id: redemptionId, circuit } : null;

  // Request lifecycle. 'claimed' is the pre-approval-flow equivalent of approved.
  const isRequested = hasClaimed && redemptionStatus === 'requested';
  const isApproved = hasClaimed && (redemptionStatus === 'approved' || redemptionStatus === 'claimed');
  const isClosedRequest = hasClaimed && ['declined', 'expired', 'cancelled'].includes(redemptionStatus ?? '');
  const canRequestAgain = redemptionStatus === 'cancelled' || redemptionStatus === 'expired';
  // The approve function switches a current off once its last spot is filled.
  const isFull = circuit.is_active === false && !isExpired;
  const requestExpiresAt = requestedAt
    ? new Date(new Date(requestedAt).getTime() + 48 * 60 * 60 * 1000).toISOString()
    : null;

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
        {expiresSoon && !eventAt && (!hasClaimed || isClosedRequest) && (
          <View style={styles.expiresSoonBanner}>
            <Icon name="bell" size={15} color="#92400E" />
            <Text style={styles.expiredBannerText}>
              {daysUntilExpiry === 1 ? 'Expires tomorrow — claim soon!' : `Expires in ${daysUntilExpiry} days`}
            </Text>
          </View>
        )}

        {/* ── Event hero: what, when, where ── */}
        <Text style={styles.title}>{circuit.title}</Text>

        {eventAt && (
          <View style={styles.whenRow}>
            <View style={styles.calTile}>
              <Text style={styles.calMonth}>{eventAt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</Text>
              <Text style={styles.calDay}>{eventAt.getDate()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.whenDay}>{eventAt.toLocaleDateString('en-US', { weekday: 'long' })}</Text>
              <Text style={styles.whenTime}>
                {eventAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {daysToEvent != null && daysToEvent >= 0 ? `  ·  ${daysToEvent === 0 ? 'Today' : daysToEvent === 1 ? 'Tomorrow' : `in ${daysToEvent} days`}` : ''}
              </Text>
            </View>
          </View>
        )}

        {circuit.description ? <Text style={styles.leadDesc}>{circuit.description}</Text> : null}

        {(!hasClaimed || isClosedRequest) && (
          <>
            {/* The perk */}
            <View style={styles.perkPill}>
              <View style={styles.perkIcon}><Icon name="ticket" size={18} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.perkPillTitle}>
                  {ticketsLabel}
                </Text>
                <Text style={styles.perkPillSub}>
                  {ticketCount > 1 ? `Bring ${ticketCount === 2 ? 'a friend' : `${ticketCount - 1} friends`}, post an honest video after.` : 'Post an honest video after.'}
                </Text>
              </View>
            </View>

            {circuit.event_link ? (
              <TouchableOpacity style={styles.eventCard} onPress={() => Linking.openURL(circuit.event_link!)} activeOpacity={0.8}>
                <Text style={styles.eventCardLabel}>See the full event</Text>
                <View style={styles.eventCardOpen}>
                  <Text style={styles.eventCardOpenText}>Open</Text>
                  <Icon name="arrow" size={14} color={C.accent} />
                </View>
              </TouchableOpacity>
            ) : null}

            {circuit.business_id ? (
              <TouchableOpacity
                style={styles.bizRow}
                onPress={() => navigation.navigate('BusinessPublicProfile', { businessId: circuit.business_id })}
                activeOpacity={0.7}
              >
                <Icon name="storefront" size={16} color={C.muted} />
                <Text style={styles.bizRowLabel}>See the business</Text>
                <Text style={styles.bizRowName} numberOfLines={1}>
                  {circuit.business?.business_name}{neighborhood ? ` · ${neighborhood}` : ''}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Who can go: one quiet line; tap for the full requirements */}
            <TouchableOpacity onPress={() => setShowReqModal(true)} activeOpacity={0.7} style={styles.reqLine}>
              <Text style={styles.reqLineText}>
                {eligStatus !== null && (
                  <Text style={[
                    styles.reqLineStatus,
                    { color: eligStatus === 'eligible' ? C.ok : eligStatus === 'soon' ? C.accent : C.muted },
                  ]}>
                    {eligStatus === 'eligible' ? "YOU'RE ELIGIBLE" : eligStatus === 'soon' ? 'OPENING TO YOU SOON' : 'NOT ELIGIBLE'}
                  </Text>
                )}
                {[
                  effectiveMin != null ? `${minFollowersLabel(effectiveMin)} followers` : null,
                  postOnLabel ? `Post on ${postOnLabel}` : null,
                  circuit.max_redemptions != null ? `Only ${circuit.max_redemptions} creators get in` : null,
                  isManual && isRecurring ? 'Multiple dates' : null,
                  isManual && circuit.request_deadline ? `${circuit.business?.business_name ?? 'The business'} will send invites by ${new Date(circuit.request_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null,
                ].filter(Boolean).map((x, i) => (i === 0 && eligStatus === null ? x : `  ·  ${x}`)).join('')}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Requested: waiting on the business ── */}
        {isRequested && (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>{isManual ? 'Invite requested' : 'Request sent 🙌'}</Text>
            {isManual ? (
              <Text style={styles.stepText}>
                {circuit.business?.business_name ?? 'The business'} will send invites
                {circuit.request_deadline ? ` by ${new Date(circuit.request_deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}` : ''}.
                We'll let you know if you're invited, and you'll have up to 72 hours to accept.
              </Text>
            ) : null}
            {isManual && circuit.request_deadline && new Date(circuit.request_deadline) < new Date() ? (
              <Text style={styles.stepNote}>
                The deadline has passed. Waiting on {circuit.business?.business_name ?? 'the business'} to send invites.
              </Text>
            ) : null}
          </View>
        )}

        {/* ── Declined / expired / withdrawn ── */}
        {isClosedRequest && (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>
              {redemptionStatus === 'declined' ? 'Not this time'
                : redemptionStatus === 'expired' ? (isManual ? 'Tickets released' : 'Request expired')
                : 'Request withdrawn'}
            </Text>
            <Text style={styles.stepText}>
              {redemptionStatus === 'declined'
                ? (isManual ? "You weren't invited this time. More events are coming!" : "The business went with other creators for this one. Don't sweat it, there are more currents to request.")
                : redemptionStatus === 'expired' && isManual
                ? "We didn't hear back within 72 hours, so your tickets went to another creator."
                : redemptionStatus === 'expired'
                ? "The business didn't respond within 48 hours. You can request again or browse other currents."
                : 'You withdrew your request. You can request again if spots are still open.'}
            </Text>
            {['declined', 'expired'].includes(redemptionStatus ?? '') && otherEvents.length > 0 && (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={[styles.stepText, { fontFamily: F.bodySemi }]}>Other events you can request</Text>
                {otherEvents.map(ev => (
                  <TouchableOpacity key={ev.id} style={styles.eventCard} onPress={() => navigation.push('CircuitDetail', { circuit: ev })} activeOpacity={0.8}>
                    <Text style={styles.eventCardLabel} numberOfLines={1}>{ev.title}</Text>
                    <View style={styles.eventCardOpen}>
                      <Text style={styles.eventCardOpenText}>View</Text>
                      <Icon name="arrow" size={14} color={C.accent} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Picked (manual): how to get tickets + "Got it!" ── */}
        {isApproved && isManual && deliveryMethod && (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>You're invited! 🎟️</Text>
            {eventDateStr ? <Text style={styles.stepNote}>{circuit.title} · {eventDateStr}</Text> : null}
            {!eventDateStr && goingStr ? <Text style={[styles.stepText, { fontFamily: F.bodySemi }]}>You're going {goingStr}.</Text> : null}
            {deliveryMethod === 'code' ? (
              <>
                <Text style={styles.stepText}>Use this code to get {ticketsLabel}:</Text>
                {accessDetails ? (
                  <TouchableOpacity style={styles.detailsBox} activeOpacity={0.7} onPress={async () => {
                    await Clipboard.setStringAsync(accessDetails);
                    setDetailsCopied(true); setTimeout(() => setDetailsCopied(false), 1500);
                  }}>
                    <Text style={styles.detailsText} selectable>{accessDetails}</Text>
                    <View style={styles.codeCopy}>
                      <Icon name={detailsCopied ? 'check' : 'clipboard'} size={14} color={C.accent} />
                      <Text style={styles.codeCopyText}>{detailsCopied ? 'Copied' : 'Copy'}</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                {circuit.event_link ? (
                  <TouchableOpacity onPress={() => Linking.openURL(circuit.event_link!)} activeOpacity={0.7}>
                    <Text style={styles.eventLinkText}>Get tickets →</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : deliveryMethod === 'guest_list' ? (
              <Text style={styles.stepText}>
                You're on the guest list under <Text style={{ fontFamily: F.bodySemi }}>{creatorName || 'your name'}</Text>
                {ticketCount > 1 ? ` (+${ticketCount - 1})` : ''}. Show your ID at the door.
              </Text>
            ) : (
              <Text style={styles.stepText}>
                {confirmedAt ? '' : 'Once you tap Accept, '}{circuit.business?.business_name ?? 'The business'} will email your {ticketsLabel.replace('free ', '')} to{' '}
                <Text style={{ fontFamily: F.bodySemi }}>{myEmail || 'your email'}</Text>. Keep an eye on your inbox (and spam folder).
              </Text>
            )}
            {!confirmedAt ? (
              <Text style={[styles.stepNote, { color: '#92400E' }]}>
                {deliveryMethod === 'code'
                  ? `Use the code to get your tickets, then tap "I got my tickets" by ${confirmByStr} to keep your spot.`
                  : `Tap "Accept invite" by ${confirmByStr} to keep your spot.`} Otherwise your tickets go to another creator.
              </Text>
            ) : (
              <Text style={[styles.stepNote, { color: C.ok }]}>You accepted. See you there!</Text>
            )}
            <Text style={styles.stepText}>After the event, post within 48 hours with #localcurrentapp in your caption.</Text>
          </View>
        )}

        {isApproved && !(isManual && deliveryMethod) && (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>Your tickets 🎟️ {circuit.title}</Text>
            {eventDateStr ? <Text style={styles.stepNote}>{eventDateStr}</Text> : null}

            <View style={styles.stepRow}>
              <View style={styles.stepBullet}><Text style={styles.stepBulletText}>1</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>
                  {`Use this code to get ${ticketsLabel}:`}
                </Text>
                {accessDetails ? (
                  <TouchableOpacity
                    style={styles.detailsBox}
                    activeOpacity={0.7}
                    onPress={async () => {
                      await Clipboard.setStringAsync(accessDetails);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setDetailsCopied(true);
                      setTimeout(() => setDetailsCopied(false), 1500);
                    }}
                  >
                    <Text style={styles.detailsText} selectable>{accessDetails}</Text>
                    <View style={styles.codeCopy}>
                      <Icon name={detailsCopied ? 'check' : 'clipboard'} size={14} color={C.accent} />
                      <Text style={styles.codeCopyText}>{detailsCopied ? 'Copied' : 'Copy'}</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.stepNote}>Check with the business for your ticket code.</Text>
                )}
                {circuit.event_link ? (
                  <TouchableOpacity onPress={() => Linking.openURL(circuit.event_link!)} activeOpacity={0.7}>
                    <Text style={styles.eventLinkText}>Buy tickets →</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepBullet}><Text style={styles.stepBulletText}>2</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>{eventAt ? 'Get your tickets on their site with the code, then tap "I got my tickets."' : 'Book your date on their site with the code, then tap "I got my tickets" and tell us which day you\'re going.'}</Text>
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
                <Text style={styles.stepText}>Post your video within 48 hours and add #localcurrentapp to the caption.</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── State 2a: Booked (code current) — attend & post ── */}
        {hasClaimed && redemptionStatus === 'checked_in' && (
          <View style={styles.bookedWrap}>
            <Text style={styles.bookedTitle}>Have fun!</Text>
            <View style={styles.bookedRow}>
              <Icon name="ticket" size={18} color={C.accent} />
              <Text style={[styles.stepText, { flex: 1 }]}>
                {deliveryMethod === 'guest_list'
                  ? `You're on the guest list under ${creatorName || 'your name'}${ticketCount > 1 ? ` (+${ticketCount - 1})` : ''}${goingStr ? ` for ${goingStr}` : ''}. Show your ID at the door.`
                  : deliveryMethod === 'email' && ticketsSentAt
                  ? `${circuit.business?.business_name ?? 'The business'} emailed your tickets to ${myEmail || 'your email'}${goingStr ? ` for ${goingStr}` : ''}. Check your inbox (and spam folder).`
                  : deliveryMethod === 'email' && !confirmedAt
                  ? `Once you tap Accept, ${circuit.business?.business_name ?? 'The business'} will email your tickets to ${myEmail || 'your email'}. Keep an eye on your inbox (and spam folder).`
                  : deliveryMethod === 'email'
                  ? `${circuit.business?.business_name ?? 'The business'} will email your tickets to ${myEmail || 'your email'}${goingStr ? ` for ${goingStr}` : ''}. Check your spam folder too.`
                  : "You redeemed tickets on the event's ticketing site. For ticket and event details, check the email you used to redeem them."}
              </Text>
            </View>
            <View style={styles.bookedRow}>
              <Icon name="film" size={18} color={C.accent} />
              <Text style={[styles.stepText, { flex: 1 }]}>
                After the event, post your video within 48 hours. Make sure to use <Text style={{ fontFamily: F.bodySemi }}>#localcurrentapp</Text>.
              </Text>
            </View>
            <View style={styles.bookedRow}>
              <Icon name="alert" size={18} color="#B45309" />
              <Text style={[styles.stepText, { flex: 1, color: '#92400E' }]}>
                If you don't, it won't get recorded and sent to the business!
              </Text>
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
                    <Icon name="bell" size={12} color={C.accent} />
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
            <TouchableOpacity style={styles.rateRow} onPress={() => setShowRate(true)} activeOpacity={0.8}>
              {myReview?.rating ? (
                <><Stars value={myReview.rating} size={15} /><Text style={styles.rateRowText}>Edit your review</Text></>
              ) : (
                <><Icon name="star" size={16} color={C.accent} /><Text style={styles.rateRowText}>Rate {circuit.business?.business_name ?? 'the business'}</Text></>
              )}
            </TouchableOpacity>
          </View>
        )}
        {redemptionId && (
          <RatingModal
            visible={showRate}
            kind="business"
            redemptionId={redemptionId}
            name={circuit.business?.business_name ?? 'the business'}
            initial={myReview ?? undefined}
            onClose={() => setShowRate(false)}
            onSaved={fetchRedemptionStatus}
          />
        )}

        {circuit.creator_notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes from the business</Text>
            <Text style={styles.offeringText}>{circuit.creator_notes}</Text>
          </View>
        ) : null}


        {(isRequested || isApproved) && (
          <>
            <TouchableOpacity
              style={styles.unclaimBtn}
              onPress={() => Linking.openURL(`mailto:hello@localcurrentapp.com?subject=${encodeURIComponent(`Issue with "${circuit.title}"`)}`)}
            >
              <Text style={styles.unclaimBtnText}>Report an issue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.unclaimBtn} onPress={() => setShowUnclaimModal(true)}>
              <Text style={styles.unclaimBtnText}>{isRequested ? (isManual ? 'Cancel my request' : 'Withdraw request') : 'Give up my tickets'}</Text>
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
        ) : isApproved && isManual && deliveryMethod && !confirmedAt ? (
          <TouchableOpacity style={[styles.button, confirming && styles.buttonDisabled]} onPress={handleConfirm} disabled={confirming}>
            <Text style={styles.buttonText}>{confirming ? 'Confirming…' : acceptLabel(deliveryMethod)}</Text>
          </TouchableOpacity>
        ) : isApproved && isManual && deliveryMethod && (eventAt || goingDate) ? null
        : isApproved ? (
          <TouchableOpacity
            style={[styles.button, booking && styles.buttonDisabled]}
            onPress={() => (eventAt || goingDate ? handleBooked() : setShowBookModal(true))}
            disabled={booking}
          >
            <Text style={styles.buttonText}>I got my tickets</Text>
          </TouchableOpacity>
        ) : hasClaimed && (redemptionStatus === 'checked_in' || (redemptionStatus === 'completed' && !hasPost)) ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>Post with #localcurrentapp</Text>
            <Text style={styles.ineligibleSub}>
              Add #localcurrentapp to your caption on your connected TikTok or Instagram. We'll find your video
              and add it here automatically, usually within a day.
            </Text>
          </View>
        ) : hasClaimed && !isClosedRequest ? null
        : isClosedRequest && (!canRequestAgain || (isManual && redemptionStatus === 'expired')) ? null // declined / released
        : isManual && circuit.request_deadline && new Date(circuit.request_deadline) < new Date() ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>Requests are closed</Text>
            <Text style={styles.ineligibleSub}>The deadline to ask for tickets has passed</Text>
          </View>
        ) : isFull ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>No tickets left</Text>
            <Text style={styles.ineligibleSub}>Every creator spot for this event has been claimed</Text>
          </View>
        ) : isExpired ? (
          <View style={styles.ineligibleNote}>
            <Text style={styles.ineligibleText}>This event has passed</Text>
            <Text style={styles.ineligibleSub}>Tickets are no longer available</Text>
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
            onPress={() => creatorStatus === 'pending' ? setShowPendingModal(true) : (isManual && isRecurring ? setShowDates(true) : setShowClaimModal(true))}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{isManual ? 'Request an invite' : 'Claim tickets'}</Text>
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

      {/* Recurring "You pick": choose up to 3 dates */}
      <Modal visible={showDates} transparent animationType="slide" onRequestClose={() => setShowDates(false)}>
        <View style={styles.datesOverlay}>
          <View style={styles.datesSheet}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Which dates work for you?</Text>
              <Text style={styles.datesSub}>
                Pick up to 3. {circuit.business?.business_name ?? 'The business'} will choose one when they approve you.
              </Text>
              {circuit.schedule_note ? (
                <View style={styles.datesNote}>
                  <Text style={styles.datesNoteLabel}>FROM {String(circuit.business?.business_name ?? 'the business').toUpperCase()}</Text>
                  <Text style={styles.stepText}>{circuit.schedule_note}</Text>
                </View>
              ) : null}
              {circuit.event_link ? (
                <TouchableOpacity onPress={() => Linking.openURL(circuit.event_link!)} activeOpacity={0.7}>
                  <Text style={[styles.eventLinkText, { marginBottom: 12 }]}>See dates on the event page →</Text>
                </TouchableOpacity>
              ) : null}
              <DatePicker
                value={null}
                values={pickDates}
                minDate={new Date()}
                onChange={d => setPickDates(cur => {
                  const has = cur.some(x => ymd(x) === ymd(d));
                  if (has) return cur.filter(x => ymd(x) !== ymd(d));
                  if (cur.length >= 3) { Alert.alert('Up to 3 dates', 'Tap a selected date to remove it.'); return cur; }
                  return [...cur, d].sort((a, b) => +a - +b);
                })}
              />
              {pickDates.length > 0 && (
                <Text style={[styles.datesSub, { marginTop: 8 }]}>
                  {pickDates.map(d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })).join(' · ')}
                </Text>
              )}
              <TextInput
                style={styles.datesInput}
                value={prefNote}
                onChangeText={setPrefNote}
                placeholder="Times or anything else? (optional)"
                placeholderTextColor={C.muted2}
                maxLength={140}
              />
              <Text style={[styles.datesSub, { marginTop: 10 }]}>
                If you're invited, you'll get {ticketsLabel} and have up to 72 hours to accept. Post within 48 hours of going.
              </Text>
              <TouchableOpacity style={[styles.button, (loading || !pickDates.length) && styles.buttonDisabled]} onPress={handleRequest} disabled={loading || !pickDates.length}>
                <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Request an invite'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowDates(false)}>
                <Text style={styles.modalCancelText}>Never mind</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Claim modal */}
      <Modal visible={showClaimModal} transparent animationType="fade" onRequestClose={() => setShowClaimModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowClaimModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>{isManual ? 'Request an invite?' : 'Claim your tickets?'}</Text>

            <View style={styles.claimRow}>
              <View style={styles.claimRowIcon}><Icon name="switch" size={16} color={C.accent} /></View>
              <Text style={styles.claimRowText}>
                {isManual
                  ? <>{circuit.business?.business_name ?? 'The business'} will send invites{circuit.request_deadline ? ` by ${new Date(circuit.request_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}. If you're invited, you'll get <Text style={styles.claimBold}>{ticketsLabel}</Text> and have <Text style={styles.claimBold}>up to 72 hours to accept</Text>.</>
                  : <>You'll get a <Text style={styles.claimBold}>code for {ticketsLabel}</Text> to use online right away.</>}
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
            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={() => { setShowClaimModal(false); isManual ? handleRequest() : handleClaim(); }} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Sending…' : isManual ? 'Request an invite' : 'I understand, claim tickets'}</Text>
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
              {isRequested
                ? (isManual ? "Your invite request for this event will be canceled." : "The business won't see your request anymore.")
                : "Backing out after claiming can count against you. Don't use the code if you give up your tickets."}
            </Text>
            <TouchableOpacity style={[styles.unclaimConfirmBtn, loading && styles.buttonDisabled]} onPress={handleWithdraw} disabled={loading}>
              <Text style={styles.unclaimConfirmBtnText}>{loading ? 'Withdrawing…' : isRequested ? (isManual ? 'Yes, cancel request' : 'Yes, withdraw') : 'Yes, give up my tickets'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowUnclaimModal(false)}>
              <Text style={styles.modalCancelText}>Nevermind</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Which day did you book? */}
      <Modal visible={showBookModal} transparent animationType="fade" onRequestClose={() => setShowBookModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !booking && setShowBookModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>What day are you going?</Text>
            <Text style={styles.modalBody}>
              We'll remind you to post, and your video is due within 48 hours of your visit.
            </Text>
            <View style={styles.bookRow}>
              <TextInput style={styles.bookInput} value={bookMonth} placeholder="MM" placeholderTextColor={C.muted2}
                keyboardType="number-pad" maxLength={2} onChangeText={t => setBookMonth(t.replace(/[^0-9]/g, ''))} />
              <Text style={styles.bookSlash}>/</Text>
              <TextInput style={styles.bookInput} value={bookDay} placeholder="DD" placeholderTextColor={C.muted2}
                keyboardType="number-pad" maxLength={2} onChangeText={t => setBookDay(t.replace(/[^0-9]/g, ''))} />
            </View>
            <TouchableOpacity
              style={[styles.button, (!bookedDate() || booking) && styles.buttonDisabled]}
              onPress={handleBooked}
              disabled={!bookedDate() || booking}
            >
              <Text style={styles.buttonText}>{booking ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowBookModal(false)}>
              <Text style={styles.modalCancelText}>Not yet</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {redemptionId && (
        <ReportModal visible={showReport} redemptionId={redemptionId} onClose={() => setShowReport(false)} />
      )}


      {/* Requirements detail modal */}
      <Modal visible={showReqModal} transparent animationType="fade" onRequestClose={() => setShowReqModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowReqModal(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Requirements</Text>
            {pfKeys.length > 1 && (
              <Text style={styles.eitherNote}>You only need to qualify on one platform.</Text>
            )}
            {effectiveMin != null ? (
              (pfKeys.length ? pfKeys : (['tiktok', 'instagram'] as const)).map(p => {
                const count = creatorCounts[p];
                const met = count != null && count >= effectiveMin;
                return (
                  <View key={p} style={styles.requirementRow}>
                    <View style={styles.requirementLabelRow}>
                      <Text style={styles.requirementLabel}>{p === 'tiktok' ? 'TIKTOK' : 'INSTAGRAM'} FOLLOWERS</Text>
                      <Text style={met ? styles.requirementMet : styles.requirementUnmet}>
                        {count != null ? `${met ? '✓' : '✗'} You have ${count.toLocaleString()}` : `✗ You're not on ${p === 'tiktok' ? 'TikTok' : 'Instagram'}`}
                      </Text>
                    </View>
                    <View style={styles.chipRow}>
                      <View style={styles.chip}><Text style={styles.chipText}>{minFollowersLabel(effectiveMin)}</Text></View>
                    </View>
                  </View>
                );
              })
            ) : pfKeys.length > 0 ? (
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
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.4, color: C.accent, textTransform: 'uppercase', marginBottom: 8 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 32, lineHeight: 36, letterSpacing: -0.8, color: C.ink, marginBottom: 18 },
  leadDesc: { fontFamily: F.body, fontSize: 16.5, color: C.inkSoft, lineHeight: 25, marginBottom: 22 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  calTile: {
    width: 58, height: 62, borderRadius: R.md, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', ...(S.card as any),
  },
  calMonth: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.2, color: C.accent },
  calDay: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 24, color: C.ink, marginTop: -2 },
  whenDay: { fontFamily: F.display, fontWeight: '700', fontSize: 17, color: C.ink },
  whenTime: { fontFamily: F.body, fontSize: 14.5, color: C.muted, marginTop: 2 },
  perkCard: {
    backgroundColor: C.accentTint, borderRadius: R.lg, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.accentSoft,
  },
  perkEyebrow: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4, color: C.accent, marginBottom: 4 },
  perkTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 24, letterSpacing: -0.4, color: C.ink },
  perkSub: { fontFamily: F.body, fontSize: 14.5, color: C.inkSoft, lineHeight: 21, marginTop: 6 },
  perkSpots: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent, marginTop: 10 },
  bookRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 },
  bookInput: {
    width: 72, textAlign: 'center', fontFamily: F.display, fontWeight: '700', fontSize: 22, color: C.ink,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, paddingVertical: 12, backgroundColor: C.card,
  },
  bookSlash: { fontFamily: F.display, fontSize: 22, color: C.muted2 },
  perkPill: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.accentTint,
    borderRadius: R.pill, paddingVertical: 12, paddingLeft: 12, paddingRight: 18, marginBottom: 12,
  },
  perkIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  perkPillTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.ink },
  perkPillSub: { fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, marginTop: 1 },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 6 },
  bizRowLabel: { fontFamily: F.bodySemi, fontSize: 14.5, color: C.inkSoft },
  bizRowName: { flex: 1, fontFamily: F.body, fontSize: 14, color: C.muted2 },
  reqLine: { paddingHorizontal: 2, paddingTop: 12 },
  reqLineText: { fontFamily: F.body, fontSize: 12.5, color: C.muted, lineHeight: 18 },
  reqLineStatus: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.1 },
  bookedWrap: { marginBottom: 16 },
  bookedTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink, marginBottom: 6 },
  bookedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12 },
  reqHeader: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.4, color: C.muted2, marginTop: 18, marginBottom: 10 },
  reqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  reqChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  reqChipText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.inkSoft },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.paper, borderWidth: 1.5, borderColor: C.accent, borderStyle: 'dashed',
    borderRadius: R.md, paddingVertical: 12, paddingHorizontal: 14, marginTop: 8, marginBottom: 8,
  },
  codeText: { fontFamily: F.monoBold, fontSize: 20, letterSpacing: 2, color: C.accent },
  detailsBox: {
    marginTop: 8, padding: 14, borderRadius: R.md, backgroundColor: C.accentTint,
    borderWidth: 1.5, borderColor: C.accentSoft, gap: 8,
  },
  detailsText: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink, lineHeight: 21 },
  codeCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  codeCopyText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  eventLinkText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent, marginTop: 2 },

  eligPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 11, marginBottom: 20,
  },
  eligPillOk: { backgroundColor: C.okSoft },
  eligPillSoon: { backgroundColor: C.accentTint },
  eligPillNo: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line2 },
  eligPillText: { fontFamily: F.display, fontWeight: '700', fontSize: 15 },

  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  miniCard: {
    flexBasis: '46%', flexGrow: 1, backgroundColor: C.card, borderRadius: R.lg, padding: 16,
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
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.line },
  rateRowText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent },
  stateBoxComplete: { backgroundColor: C.okSoft, borderColor: C.ok + '44' },
  stateTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.accent, marginBottom: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  stepBullet: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepBulletText: { fontFamily: F.monoBold, color: '#fff', fontSize: 11 },
  stepText: { fontFamily: F.body, fontSize: 14, color: C.inkSoft, lineHeight: 20 },
  stepNote: { fontFamily: F.body, fontSize: 12, color: C.muted, lineHeight: 17, marginTop: 4, fontStyle: 'italic' },
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
  datesOverlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  datesSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  datesSub: { fontFamily: F.body, fontSize: 13.5, color: C.muted, lineHeight: 19, marginBottom: 12 },
  datesNote: { backgroundColor: C.accentTint, borderRadius: R.md, padding: 12, marginBottom: 10, gap: 4 },
  datesNoteLabel: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.accent },
  datesInput: { fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, padding: 12, fontSize: 14, color: C.ink, backgroundColor: C.paper, marginTop: 12 },
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
