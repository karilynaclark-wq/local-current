import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/analytics';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import { MIN_FOLLOWER_OPTIONS, minFollowersLabel } from '../../lib/eligibility';

const FOLLOWER_RANGES = ['Under 1K', '1K–5K', '5K–10K', '10K–50K', '50K–100K', '100K+'];

// Tier upper bounds, for filling the legacy range fields from a numeric minimum.
const TIER_UPPER: Record<string, number> = {
  'Under 1K': 1_000, '1K–5K': 5_000, '5K–10K': 10_000,
  '10K–50K': 50_000, '50K–100K': 100_000, '100K+': Infinity,
};
const MAX_CREATORS = 50;
/** "8pm", "7:30 PM", "19:00" → [hours, minutes], or null. */
function parseTime(t: string): [number, number] | null {
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1]; const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3].startsWith('p') ? 12 : 0); }
  else if (h > 23) return null;
  return [h, min];
}

/** 11:59 PM on the given day. */
function endOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(23, 59, 0, 0); return x;
}

/** One code per line (commas also work); blanks and duplicates dropped. */
function parseCodes(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]+/).map(c => c.trim()).filter(Boolean))];
}

function InfoModal({ visible, title, body, onClose }: { visible: boolean; title: string; body: string; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalStyles.box}>
          <Text style={modalStyles.title}>{title}</Text>
          <Text style={modalStyles.body}>{body}</Text>
          <TouchableOpacity style={modalStyles.btn} onPress={onClose}>
            <Text style={modalStyles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  box: { backgroundColor: C.card, borderRadius: R.lg, padding: 24, width: '100%', ...(S.menu as any) },
  title: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.ink, marginBottom: 10 },
  body: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 22, marginBottom: 20 },
  btn: { backgroundColor: C.accent, borderRadius: R.btn, padding: 13, alignItems: 'center' },
  btnText: { fontFamily: F.bodySemi, color: '#fff', fontSize: 15 },
} as any);

export default function CreateCircuitScreen() {
  const navigation = useNavigation<any>();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>('');
  const [step, setStep] = useState(1);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('businesses').select('id, business_name').eq('profile_id', user.id).single()
        .then(({ data }) => { setBusinessId(data?.id ?? null); setBusinessName(data?.business_name ?? ''); });
    });
  }, []);

  // Step 1
  const [title, setTitle] = useState('');
  const [eventLink, setEventLink] = useState('');
  const [description, setDescription] = useState('');

  // Step 2
  const [maxRedemptions, setMaxRedemptions] = useState<number>(4);
  const [showCreatorPicker, setShowCreatorPicker] = useState(false);
  const [approvalMode, setApprovalMode] = useState<'instant' | 'manual' | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [scheduleType, setScheduleType] = useState<'one_time' | 'recurring' | null>(null);
  const [eventDay, setEventDay] = useState<Date | null>(null);
  const [eventTime, setEventTime] = useState('');
  const [anyDate, setAnyDate] = useState<boolean | null>(null);
  const [scheduleNote, setScheduleNote] = useState('');
  const [ticketsPer, setTicketsPer] = useState<number>(2); // creator + guests
  const guestCount = ticketsPer - 1;
  const [codeMode, setCodeMode] = useState<'shared' | 'list'>('shared');
  const [sharedCode, setSharedCode] = useState('');
  const [codeList, setCodeList] = useState('');
  const parsedCodes = parseCodes(codeList);
  const [minFollowing, setMinFollowing] = useState<number | null>(5_000); // follower count
  const [showMinPicker, setShowMinPicker] = useState(false);
  const [platformChoice, setPlatformChoice] = useState<'either' | 'tiktok' | 'instagram'>('either');
  const [showPlatform, setShowPlatform] = useState(false);

  // Derived eligibility in the shape the rest of the app expects.
  // Legacy range fields: every tier that can contain someone at/above the minimum.
  const eligibleRanges = minFollowing === null ? [] : FOLLOWER_RANGES.filter(r => TIER_UPPER[r] > minFollowing);
  const selectedPlatforms: ('tiktok' | 'instagram')[] =
    platformChoice === 'either' ? ['tiktok', 'instagram'] : [platformChoice];
  const platformFollowers = { tiktok: eligibleRanges, instagram: eligibleRanges };

  const [loading, setLoading] = useState(false);
  const [agreedToHonor, setAgreedToHonor] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null);

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!title.trim()) return 'Please enter an event name.';
      if (!eventLink.trim()) return 'Please add a link where creators can buy tickets.';
    }
    if (s === 2) {
      if (!approvalMode) return 'Choose how creators get tickets.';
      if (approvalMode === 'manual') {
        if (!scheduleType) return 'Tell creators when the event is.';
        if (scheduleType === 'one_time') {
          if (!eventDay) return 'Pick the event date.';
          if (!parseTime(eventTime)) return 'Add the start time, like 8:00 PM.';
        }
        if (scheduleType === 'recurring') {
          if (anyDate === null) return 'Choose which dates creators can pick.';
          if (anyDate === false && !scheduleNote.trim()) return 'Tell creators which days or times you prefer.';
        }
        if (!deadline) return 'Pick a date to choose creators by.';
        if (scheduleType === 'one_time' && eventDay && deadline > eventDay) return 'Pick creators before the event date.';
        return null;
      }
      if (minFollowing === null) return 'Please choose a minimum following.';
      if (!maxRedemptions || maxRedemptions < 1) return 'Please choose how many creators get tickets.';
      if (approvalMode === 'instant' && codeMode === 'shared' && !sharedCode.trim()) return 'Please add the ticket code creators will use.';
      if (approvalMode === 'instant' && codeMode === 'list' && parsedCodes.length < maxRedemptions)
        return `Please add at least ${maxRedemptions} codes, one for each creator (you have ${parsedCodes.length}).`;
    }
    return null;
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) { Alert.alert('Required', err); return; }
    setStep(step + 1);
  }

  function handleBack() {
    if (step === 1) navigation.goBack();
    else setStep(step - 1);
  }

  async function handleCreate() {
    const err = validateStep(3);
    if (err) { Alert.alert('Required', err); return; }
    if (!agreedToHonor) { Alert.alert('Required', 'Please acknowledge your responsibility to honor these tickets.'); return; }
    if (!businessId) { Alert.alert('Error', 'Business profile not found.'); return; }

    setLoading(true);
    try {
      const { data: circuit, error } = await supabase.from('circuits').insert({
        business_id: businessId,
        title,
        event_link: eventLink.trim() || null,
        description,
        redemption_type: 'code',
        code_mode: approvalMode === 'instant' ? codeMode : null,
        approval_mode: approvalMode,
        request_deadline: approvalMode === 'manual' && deadline ? endOfDay(deadline).toISOString() : null,
        schedule_type: approvalMode === 'manual' ? scheduleType : null,
        schedule_note: approvalMode === 'manual' && scheduleType === 'recurring' && anyDate === false ? scheduleNote.trim() : null,
        event_at: approvalMode === 'manual' && scheduleType === 'one_time' && eventDay && parseTime(eventTime)
          ? (() => { const d = new Date(eventDay); const [h, m] = parseTime(eventTime)!; d.setHours(h, m, 0, 0); return d.toISOString(); })()
          : null,
        eligibility_min_followers: approvalMode === 'manual' ? '' : [...new Set(selectedPlatforms.flatMap(p => platformFollowers[p]))].join(','),
        required_platform: approvalMode === 'manual' || selectedPlatforms.length === 2 ? 'either' : selectedPlatforms[0],
        platform_followers: approvalMode === 'manual' ? null : Object.fromEntries(selectedPlatforms.map(p => [p, platformFollowers[p]])),
        max_redemptions: approvalMode === 'manual' ? null : maxRedemptions,
        guest_count: guestCount,
        min_followers: approvalMode === 'manual' ? null : minFollowing,
        starts_at: new Date().toISOString().split('T')[0],
        expires_at: null, // stays open until every spot is claimed or the business pauses it
        is_active: true,
      }).select().single();

      if (error) throw error;

      const codes = approvalMode === 'manual' ? [] : codeMode === 'shared' ? [sharedCode.trim()] : parsedCodes;
      const { error: codeErr } = codes.length
        ? await supabase.from('circuit_codes').insert(codes.map(code => ({ circuit_id: circuit.id, code })))
        : { error: null };
      if (codeErr) {
        await supabase.from('circuits').delete().eq('id', circuit.id);
        throw codeErr;
      }

      // Notify eligible creators server-side — push tokens never leave the server
      supabase.functions.invoke('notify-new-circuit', { body: { circuitId: circuit.id } });

      trackEvent('circuit_created', {
        circuit_id: circuit.id,
        flow: 'ticket',
        code_mode: codeMode,
        approval_mode: approvalMode,
        tickets_per_creator: ticketsPer,
        max_redemptions: maxRedemptions,
        follower_ranges: [...new Set(selectedPlatforms.flatMap(p => platformFollowers[p]))],
      });
      navigation.navigate('CircuitLive', { mode: approvalMode, tickets: ticketsPer, circuit });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const STEPS = [
    { number: 1, title: 'Tell creators about your event', subtitle: '' },
    { number: 2, title: 'Choose your creators', subtitle: 'Who gets tickets, and how many' },
    { number: 3, title: 'Ready to publish', subtitle: '' },
  ];

  const currentStep = STEPS[step - 1];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Icon name={step === 1 ? 'close' : 'back'} size={20} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create your current</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          {STEPS.map(s => (
            <View key={s.number} style={styles.stepDotRow}>
              <View style={[styles.stepDot, step === s.number && styles.stepDotActive, step > s.number && styles.stepDotDone]} />
              {s.number < 3 && <View style={[styles.stepLine, step > s.number && styles.stepLineDone]} />}
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Step header */}
          <Text style={styles.stepLabel}>STEP {step} OF 3</Text>
          <Text style={styles.pageTitle}>{currentStep.title}</Text>
          {!!currentStep.subtitle && <Text style={styles.subtitle}>{currentStep.subtitle}</Text>}

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <Text style={styles.label}>Event Name *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={t => setTitle(t.slice(0, 35))}
                placeholder="e.g. Summer Rooftop Launch Party"
                placeholderTextColor={C.muted2}
                autoCapitalize="words"
                maxLength={35}
              />

              <Text style={styles.label}>Ticket link *</Text>
              <Text style={styles.hint}>Your event or ticket page.</Text>
              <TextInput
                style={styles.input}
                value={eventLink}
                onChangeText={setEventLink}
                placeholder="https://…"
                placeholderTextColor={C.muted2}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <Text style={styles.label}>Event Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Why will creators love attending your event?"
                placeholderTextColor={C.muted2}
                multiline
                numberOfLines={4}
              />
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <Text style={styles.label}>How do creators get tickets? <Text style={styles.req}>*</Text></Text>
              <View style={styles.modeCol}>
                {([
                  ['instant', 'Instant claim', 'Creators who meet your requirements claim tickets and get your code right away. Requires a discount code creators can redeem online right away.'],
                  ['manual', 'You pick', 'Creators tap "I\'m interested" before a deadline. You approve who goes and choose how they get tickets.'],
                ] as const).map(([val, label, sub]) => {
                  const on = approvalMode === val;
                  return (
                    <TouchableOpacity key={val} style={[styles.modeCard, on && styles.modeCardOn]} onPress={() => setApprovalMode(val)} activeOpacity={0.85}>
                      <View style={[styles.radio, on && styles.radioOn]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modeTitle, on && { color: C.accent }]}>{label}</Text>
                        <Text style={styles.modeSub}>{sub}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {approvalMode === 'manual' && (
                <>
                  <Text style={[styles.label, styles.labelGap]}>When is it? <Text style={styles.req}>*</Text></Text>
                  <View style={styles.platformRow}>
                    {([['one_time', 'One time'], ['recurring', 'Recurring / multiple dates']] as const).map(([val, label]) => (
                      <TouchableOpacity key={val} style={[styles.platformChip, scheduleType === val && styles.chipSelected]} onPress={() => setScheduleType(val)}>
                        <Text style={[styles.chipText, { color: C.ink }, scheduleType === val && styles.chipTextSelected]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {scheduleType === 'one_time' && (
                    <View style={{ marginTop: 14 }}>
                      <DatePicker value={eventDay} onChange={setEventDay} minDate={new Date(Date.now() + 86_400_000)} />
                      <Text style={[styles.label, { marginTop: 14 }]}>Start time</Text>
                      <TextInput style={styles.input} value={eventTime} onChangeText={setEventTime}
                        placeholder="e.g. 8:00 PM" placeholderTextColor={C.muted2} autoCapitalize="none" autoCorrect={false} />
                    </View>
                  )}

                  {scheduleType === 'recurring' && (
                    <View style={{ marginTop: 14, gap: 10 }}>
                      {([[true, 'Any date on our event page', 'Creators pick dates that work for them from your event page.'],
                         [false, 'We prefer certain days or times', 'Tell creators what works best for you.']] as const).map(([val, label, sub]) => {
                        const on = anyDate === val;
                        return (
                          <TouchableOpacity key={String(val)} style={[styles.modeCard, on && styles.modeCardOn]} onPress={() => setAnyDate(val)} activeOpacity={0.85}>
                            <View style={[styles.radio, on && styles.radioOn]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.modeTitle, on && { color: C.accent }]}>{label}</Text>
                              <Text style={styles.modeSub}>{sub}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {anyDate === false && (
                        <TextInput style={[styles.input, { marginBottom: 0 }]} value={scheduleNote} onChangeText={setScheduleNote}
                          placeholder="e.g. Weeknights only, or Fri–Sat 8 PM shows" placeholderTextColor={C.muted2} maxLength={140} />
                      )}
                      <Text style={styles.hint}>Creators choose up to 3 dates when they ask for tickets. You pick one when you approve them.</Text>
                    </View>
                  )}

                  <Text style={[styles.label, styles.labelGap]}>Pick creators by <Text style={styles.req}>*</Text></Text>
                  <Text style={styles.hint}>Creators can ask for tickets until this date. You can approve anytime, even before it.</Text>
                  <DatePicker value={deadline} onChange={setDeadline} minDate={new Date(Date.now() + 86_400_000)} />
                  {deadline && (
                    <Text style={[styles.hint, { marginTop: 8 }]}>
                      Deadline: {deadline.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at 11:59 PM
                    </Text>
                  )}
                </>
              )}

              {approvalMode && (<>
                <Text style={[styles.label, styles.labelGap]}>How many tickets does each creator get? <Text style={styles.req}>*</Text></Text>
                <View style={styles.chips}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity key={n} style={[styles.chip, ticketsPer === n && styles.chipSelected]} onPress={() => setTicketsPer(n)}>
                      <Text style={[styles.chipText, ticketsPer === n && styles.chipTextSelected]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.hint, { marginTop: -12 }]}>
                  {ticketsPer === 1 ? 'Just one ticket, for the creator.' : ticketsPer === 2 ? '2 tickets: the creator can bring a friend.' : `${ticketsPer} tickets: the creator can bring ${ticketsPer - 1} friends.`}
                </Text>
              </>)}

              {approvalMode === 'instant' && (<>
              <Text style={[styles.label, styles.labelGap]}>Minimum following <Text style={styles.req}>*</Text></Text>
              <Text style={styles.hint}>Creators with larger followings will get first access.</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowMinPicker(v => !v)}>
                <Text style={minFollowing !== null ? styles.pickerValue : styles.pickerPlaceholder}>
                  {minFollowing !== null ? minFollowersLabel(minFollowing) : 'Select a minimum'}
                </Text>
                <Icon name="chevron-down" size={18} color={C.inkSoft} />
              </TouchableOpacity>
              {showMinPicker && (
                <View style={styles.pickerDropdown}>
                  {MIN_FOLLOWER_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.pickerOption, minFollowing === opt.value && styles.pickerOptionSelected]}
                      onPress={() => { setMinFollowing(opt.value); setShowMinPicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, minFollowing === opt.value && styles.pickerOptionTextSelected]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {showPlatform ? (
                <View style={styles.platformCard}>
                  <View style={styles.platformHeader}>
                    <Text style={styles.platformTitle}>Platform</Text>
                    <TouchableOpacity onPress={() => setPlatformChoice('either')}>
                      <Text style={[styles.platformEither, platformChoice === 'either' && styles.platformEitherOn]}>Either is fine</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.platformRow}>
                    {([['tiktok', 'TikTok only'], ['instagram', 'Instagram only']] as const).map(([val, label]) => {
                      const on = platformChoice === val;
                      return (
                        <TouchableOpacity
                          key={val}
                          style={[styles.platformChip, on && styles.chipSelected]}
                          onPress={() => setPlatformChoice(on ? 'either' : val)}
                        >
                          <Text style={[styles.chipText, { color: C.ink }, on && styles.chipTextSelected]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.platformNote}>
                    If you don't choose one, creators can post on either TikTok or Instagram as long as they meet the follower requirement.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.platformLink} onPress={() => setShowPlatform(true)} activeOpacity={0.7}>
                  <Icon name="cog" size={14} color={C.accent} stroke={1.8} />
                  <Text style={styles.platformLinkText}>Want a specific platform? Choose it here.</Text>
                </TouchableOpacity>
              )}

              <Text style={[styles.label, styles.labelGap]}>How many creators get tickets? <Text style={styles.req}>*</Text></Text>
              <View style={styles.stepper}>
                <Text style={styles.stepperValue}>{maxRedemptions}</Text>
                <Text style={styles.stepperUnit}>creators</Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, maxRedemptions <= 1 && { opacity: 0.4 }]}
                  onPress={() => setMaxRedemptions(n => Math.max(1, n - 1))}
                  disabled={maxRedemptions <= 1}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.stepperBtn, maxRedemptions >= MAX_CREATORS && { opacity: 0.4 }]}
                  onPress={() => setMaxRedemptions(n => Math.min(MAX_CREATORS, n + 1))}
                  disabled={maxRedemptions >= MAX_CREATORS}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.summary}>
                {maxRedemptions * ticketsPer} tickets total ({maxRedemptions} creators × {ticketsPer})
              </Text>

              {(<>
              <Text style={[styles.label, styles.labelGap]}>Ticket code <Text style={styles.req}>*</Text></Text>
              <Text style={styles.hint}>Creators enter this on your ticket site to get {ticketsPer} free {ticketsPer === 1 ? 'ticket' : 'tickets'}.</Text>
              <View style={styles.platformRow}>
                {([['shared', 'One code for everyone'], ['list', 'Unique code per creator']] as const).map(([val, label]) => {
                  const on = codeMode === val;
                  return (
                    <TouchableOpacity key={val} style={[styles.platformChip, on && styles.chipSelected]} onPress={() => setCodeMode(val)}>
                      <Text style={[styles.chipText, { color: C.ink }, on && styles.chipTextSelected]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {codeMode === 'shared' ? (
                <TextInput
                  style={[styles.input, { marginTop: 12 }]}
                  value={sharedCode}
                  onChangeText={setSharedCode}
                  placeholder="e.g. LOCALCURRENT"
                  placeholderTextColor={C.muted2}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              ) : (
                <>
                  <TextInput
                    style={[styles.input, styles.multiline, { marginTop: 12 }]}
                    value={codeList}
                    onChangeText={setCodeList}
                    placeholder={'One code per line\nLC-A1B2\nLC-C3D4'}
                    placeholderTextColor={C.muted2}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    multiline
                  />
                  <Text style={[styles.hint, parsedCodes.length >= maxRedemptions && { color: C.ok }]}>
                    {parsedCodes.length} of {maxRedemptions} codes added
                  </Text>
                </>
              )}
              </>)}
              </>)}

              {approvalMode === 'manual' && (
                <Text style={[styles.hint, { marginTop: 22 }]}>
                  You'll see everyone who's interested and choose who goes. When you approve someone, you pick how they get tickets: a promo code, the guest list, or by email.
                </Text>
              )}
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <>
              <TouchableOpacity
                style={[styles.commitmentBox, agreedToHonor && styles.commitmentBoxChecked]}
                onPress={() => setAgreedToHonor(v => !v)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, agreedToHonor && styles.checkboxChecked]}>
                  {agreedToHonor && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.commitmentText}>
                  By publishing this current, I commit to honoring it as described. Failure to do so may result in suspension or removal from Local Current.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleCreate}
                disabled={loading}
              >
                <Icon name="sparkles" size={18} color="#fff" />
                <Text style={styles.buttonText}>{loading ? 'Publishing…' : 'Publish your current!'}</Text>
              </TouchableOpacity>
            </>
          )}

          {step < 3 && (
            <TouchableOpacity style={styles.button} onPress={handleNext}>
              <Text style={styles.buttonText}>{step === 2 ? 'Continue' : 'Next'}</Text>
              {step !== 2 && <Icon name="arrow" size={16} color="#fff" />}
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <InfoModal
        visible={!!infoModal}
        title={infoModal?.title ?? ''}
        body={infoModal?.body ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  modeCol: { gap: 10, marginBottom: 4 },
  modeCard: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card },
  modeCardOn: { borderColor: C.accent, backgroundColor: C.accentTint },
  modeTitle: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  modeSub: { fontFamily: F.body, fontSize: 12.5, color: C.muted, lineHeight: 17, marginTop: 2 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.line2, marginTop: 2 },
  radioOn: { borderColor: C.accent, backgroundColor: C.accent },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
    backgroundColor: C.card,
  },
  headerTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.ink },
  backBtn: { width: 36, alignItems: 'flex-start' },

  stepIndicator: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 40,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  stepDotRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.line2 },
  stepDotActive: { backgroundColor: C.accent, width: 12, height: 12, borderRadius: 6 },
  stepDotDone: { backgroundColor: C.accentSoft },
  stepLine: { flex: 1, height: 2, backgroundColor: C.line2, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: C.accentSoft },

  scroll: { padding: 24 },

  stepLabel: { fontFamily: F.mono, fontSize: 11, color: C.accent, letterSpacing: 1.2, marginBottom: 6 },
  pageTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 24, letterSpacing: -0.4, color: C.ink, marginBottom: 4 },
  subtitle: { fontFamily: F.body, fontSize: 14, color: C.muted, marginBottom: 24 },

  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 6 },
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft, flex: 1, marginBottom: 7 },
  tipsBtn: { backgroundColor: C.accentTint, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: C.accentSoft },
  tipsBtnText: { fontFamily: F.bodySemi, fontSize: 11, color: C.accent },
  hint: { fontFamily: F.body, fontSize: 12, color: C.muted2, marginBottom: 8 },
  req: { color: C.accent },
  labelGap: { marginTop: 22 },
  platformLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 },
  platformLinkText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.accent },
  platformCard: {
    marginTop: -8, padding: 14, borderRadius: R.md, backgroundColor: C.card,
    borderWidth: 1.5, borderColor: C.line2, gap: 10,
  },
  platformHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  platformTitle: { fontFamily: F.bodySemi, fontSize: 13, color: C.ink },
  platformEither: { fontFamily: F.body, fontSize: 12.5, color: C.muted2 },
  platformEitherOn: { color: C.accent },
  platformRow: { flexDirection: 'row', gap: 10 },
  platformChip: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: R.pill,
    borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card,
  },
  platformNote: { fontFamily: F.body, fontSize: 11.5, color: C.muted, lineHeight: 16 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, backgroundColor: C.card,
    paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
  },
  stepperValue: { fontFamily: F.body, fontSize: 15, color: C.ink, flex: 1 },
  stepperUnit: { fontFamily: F.body, fontSize: 13, color: C.muted, marginRight: 4 },
  stepperBtn: {
    width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.paper, borderWidth: 1, borderColor: C.line,
  },
  stepperBtnText: { fontFamily: F.body, fontSize: 17, color: C.ink },
  summary: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 8, marginBottom: 4 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card,
    marginBottom: 20,
  },
  multiline: { height: 110, textAlignVertical: 'top' },


  picker: {
    borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, backgroundColor: C.card,
    padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  pickerValue: { fontFamily: F.body, fontSize: 15, color: C.ink },
  pickerPlaceholder: { fontFamily: F.body, fontSize: 15, color: C.muted2 },
  pickerDropdown: { borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, marginTop: 4, overflow: 'hidden', backgroundColor: C.card },
  pickerOption: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  pickerOptionSelected: { backgroundColor: C.accentTint },
  pickerOptionText: { fontFamily: F.body, fontSize: 15, color: C.inkSoft },
  pickerOptionTextSelected: { fontFamily: F.bodySemi, color: C.accent },

  redemptionOptions: { gap: 8 },
  redemptionOption: { padding: 14, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card },
  redemptionOptionSelected: { borderColor: C.accent, backgroundColor: C.accentTint },
  redemptionOptionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  redemptionOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  redemptionOptionText: { fontFamily: F.bodyMedium, fontSize: 14, color: C.muted },
  redemptionOptionTextSelected: { fontFamily: F.bodySemi, color: C.accent },
  infoIcon: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
    borderColor: C.muted2, alignItems: 'center', justifyContent: 'center',
  },
  infoIconText: { fontFamily: F.mono, fontSize: 11, color: C.muted2, fontStyle: 'italic' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card },
  chipSelected: { backgroundColor: C.accent, borderColor: C.accent },
  chipActive: { borderWidth: 2, borderColor: C.ink },
  chipText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.muted },
  chipTextSelected: { fontFamily: F.bodySemi, color: '#fff' },

  visitOptions: { gap: 8 },
  visitOption: { padding: 14, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card },
  visitOptionSelected: { borderColor: C.accent, backgroundColor: C.accentTint },
  visitOptionText: { fontFamily: F.bodyMedium, fontSize: 14, color: C.muted, lineHeight: 20 },
  visitOptionTextSelected: { fontFamily: F.bodySemi, color: C.accent },

  dateInputMonth: { width: 64, textAlign: 'center' },
  dateInputDay: { width: 64, textAlign: 'center' },
  dateInputYear: { flex: 1, textAlign: 'center' },

  button: {
    backgroundColor: C.accent, borderRadius: R.btn, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 32, ...(S.button as any),
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', color: '#fff', fontSize: 16 },
  commitmentBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.accentTint, borderRadius: R.md, padding: 14,
    borderWidth: 1, borderColor: C.accentSoft, marginBottom: 18,
  },
  commitmentBoxChecked: { borderColor: C.accent },
  commitmentText: { fontFamily: F.body, fontSize: 13, color: C.accent, flex: 1, lineHeight: 19 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: C.line2,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkLabel: { fontFamily: F.body, fontSize: 13, color: C.inkSoft, flex: 1, lineHeight: 19 },
} as any);
