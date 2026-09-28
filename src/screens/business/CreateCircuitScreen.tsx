import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { RedemptionType } from '../../types';
import { trackEvent } from '../../lib/analytics';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

const FOLLOWER_RANGES = ['Under 1K', '1K–5K', '5K–10K', '10K–50K', '50K–100K', '100K+'];

const GUEST_OPTIONS = [
  { label: 'No, this offer only covers the creator', value: 0 },
  { label: '+ 1 friend', value: 1 },
  { label: '+ 2 friends', value: 2 },
  { label: '+ 3 friends', value: 3 },
  { label: '+ 4 friends', value: 4 },
  { label: '+ 5 friends', value: 5 },
  { label: '+ 6 friends', value: 6 },
  { label: '+ 7 friends', value: 7 },
  { label: '+ 8 friends', value: 8 },
  { label: '+ 9 friends', value: 9 },
  { label: '+ 10 friends', value: 10 },
];

// How redemption codes map to creators:
//  shared      – one code for every creator
//  per_creator – one code per creator (covers them + any friends)
//  per_person  – one code per person (creator + each friend)
type CodeMode = 'shared' | 'per_creator' | 'per_person';

function codesPerCreator(mode: CodeMode | null, guests: number): number {
  if (mode === 'per_person') return 1 + guests;
  return 1;
}

function parseCodes(text: string): string[] {
  return text.split('\n').map(c => c.trim()).filter(Boolean);
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
  const [maxRedemptions, setMaxRedemptions] = useState<number | null>(null);
  const [showCreatorPicker, setShowCreatorPicker] = useState(false);
  const [guestCount, setGuestCount] = useState<number>(1); // +1 friend is the most common offer
  const [codeMode, setCodeMode] = useState<CodeMode | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<('tiktok' | 'instagram')[]>([]);
  const [activePlatform, setActivePlatform] = useState<'tiktok' | 'instagram' | null>(null);
  const [platformFollowers, setPlatformFollowers] = useState<{ tiktok: string[]; instagram: string[] }>({ tiktok: [], instagram: [] });

  // Step 3
  const [redemptionType, setRedemptionType] = useState<RedemptionType>('code');
  const [codes, setCodes] = useState('');
  const [creatorNotes, setCreatorNotes] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [startDay, setStartDay] = useState('');
  const [startYear, setStartYear] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expDay, setExpDay] = useState('');
  const [expYear, setExpYear] = useState('');

  const [loading, setLoading] = useState(false);
  const [agreedToHonor, setAgreedToHonor] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null);

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!title.trim()) return 'Please enter an event name.';
      if (!eventLink.trim()) return 'Please add an event link.';
    }
    if (s === 2) {
      if (maxRedemptions === null) return 'Please select how many creators you\'d like to host.';
      if (selectedPlatforms.length === 0) return 'Please select at least one platform.';
      for (const p of selectedPlatforms) {
        if (platformFollowers[p].length === 0) {
          return `Please select a follower range for ${p === 'tiktok' ? 'TikTok' : 'Instagram'}.`;
        }
      }
      if (!codeMode) return 'Please choose how creators will redeem.';
      const list = parseCodes(codes);
      if (codeMode === 'shared') {
        if (list.length !== 1) return 'Please enter the one code everyone will use.';
      } else {
        const needed = maxRedemptions * codesPerCreator(codeMode, guestCount);
        if (list.length < needed) return `Please add ${needed} codes — you've added ${list.length}.`;
      }
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
    if (!agreedToHonor) { Alert.alert('Required', 'Please acknowledge your responsibility to honor this offer.'); return; }
    if (!businessId) { Alert.alert('Error', 'Business profile not found.'); return; }

    setLoading(true);
    try {
      const { data: circuit, error } = await supabase.from('circuits').insert({
        business_id: businessId,
        title,
        event_link: eventLink.trim() || null,
        description,
        creator_notes: creatorNotes.trim() || null,
        redemption_type: redemptionType,
        eligibility_min_followers: [...new Set(selectedPlatforms.flatMap(p => platformFollowers[p]))].join(','),
        required_platform: selectedPlatforms.length === 2 ? 'either' : selectedPlatforms[0],
        platform_followers: Object.fromEntries(selectedPlatforms.map(p => [p, platformFollowers[p]])),
        max_redemptions: maxRedemptions,
        guest_count: guestCount,
        code_mode: codeMode,
        starts_at: new Date().toISOString().split('T')[0],
        expires_at: null,
        is_active: true,
      }).select().single();

      if (error) throw error;

      if (redemptionType === 'code' && codes.trim()) {
        const codeList = parseCodes(codes);
        await supabase.from('circuit_codes').insert(
          codeList.map(code => ({ circuit_id: circuit.id, code, is_used: false }))
        );
      }

      if (redemptionType === 'voucher' && maxRedemptions) {
        await supabase.from('circuit_codes').insert(
          Array.from({ length: maxRedemptions }, () => ({
            circuit_id: circuit.id,
            code: `VCH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            is_used: false,
          }))
        );
      }

      // Notify eligible creators server-side — push tokens never leave the server
      supabase.functions.invoke('notify-new-circuit', {
        body: {
          circuitTitle: title,
          businessName: businessName || 'A local business',
          eligibilityMinFollowers: [...new Set(selectedPlatforms.flatMap(p => platformFollowers[p]))].join(','),
          eligibilityNiches: [],
        },
      });

      trackEvent('circuit_created', {
        circuit_id: circuit.id,
        redemption_type: redemptionType,
        max_redemptions: maxRedemptions,
        follower_ranges: [...new Set(selectedPlatforms.flatMap(p => platformFollowers[p]))],
      });
      navigation.navigate('CircuitLive', { redemptionType });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const STEPS = [
    { number: 1, title: 'Tell creators about your event', subtitle: '' },
    { number: 2, title: 'Choose your creators', subtitle: 'Define who you want to promote it' },
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

              <Text style={styles.label}>Event Link *</Text>
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
              <Text style={styles.label}>What platform would you like the video shared to? *</Text>
              <View style={styles.chips}>
                {(['TikTok', 'Instagram'] as const).map(p => {
                  const val = p.toLowerCase() as 'tiktok' | 'instagram';
                  const isSelected = selectedPlatforms.includes(val);
                  const isActive = activePlatform === val;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, isSelected && styles.chipSelected, isActive && styles.chipActive]}
                      onPress={() => {
                        if (isSelected && isActive) {
                          // deselect this platform
                          setSelectedPlatforms(prev => prev.filter(x => x !== val));
                          setPlatformFollowers(prev => ({ ...prev, [val]: [] }));
                          setActivePlatform(prev => {
                            const remaining = selectedPlatforms.filter(x => x !== val);
                            return remaining[0] ?? null;
                          });
                        } else {
                          if (!isSelected) setSelectedPlatforms(prev => [...prev, val]);
                          setActivePlatform(val);
                        }
                      }}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {isSelected ? '✓ ' : ''}{p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {activePlatform && (
                <>
                  <Text style={styles.label}>
                    What size {activePlatform === 'tiktok' ? 'TikTok' : 'Instagram'} following must the creator have? *
                  </Text>
                  <Text style={styles.hint}>
                    Select all that apply · We'll show your current to larger tiers first and open it to smaller tiers every 24 hours as needed.
                  </Text>
                  <View style={styles.chips}>
                    {FOLLOWER_RANGES.map(r => {
                      const ranges = platformFollowers[activePlatform];
                      const on = ranges.includes(r);
                      return (
                        <TouchableOpacity
                          key={r}
                          style={[styles.chip, on && styles.chipSelected]}
                          onPress={() => setPlatformFollowers(prev => ({
                            ...prev,
                            [activePlatform]: prev[activePlatform].includes(r)
                              ? prev[activePlatform].filter(x => x !== r)
                              : [...prev[activePlatform], r],
                          }))}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextSelected]}>{r}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.label}>How many creators can claim this? *</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowCreatorPicker(!showCreatorPicker)}>
                <Text style={maxRedemptions ? styles.pickerValue : styles.pickerPlaceholder}>
                  {maxRedemptions ? `${maxRedemptions} creator${maxRedemptions > 1 ? 's' : ''}` : 'Select a number'}
                </Text>
                <Icon name="arrow" size={14} color={C.muted2} />
              </TouchableOpacity>
              {showCreatorPicker && (
                <View style={styles.pickerDropdown}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.pickerOption, maxRedemptions === n && styles.pickerOptionSelected]}
                      onPress={() => { setMaxRedemptions(n); setShowCreatorPicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, maxRedemptions === n && styles.pickerOptionTextSelected]}>
                        {n} creator{n > 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>What does each creator get? *</Text>
              <View style={styles.chips}>
                {GUEST_OPTIONS.map(opt => {
                  const on = guestCount === opt.value;
                  const label = opt.value === 0 ? 'Just them' : `Them + ${opt.value} friend${opt.value > 1 ? 's' : ''}`;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, on && styles.chipSelected]}
                      onPress={() => {
                        setGuestCount(opt.value);
                        if (opt.value === 0 && codeMode === 'per_person') setCodeMode('per_creator');
                      }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextSelected]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>How will creators redeem it? *</Text>
              {([
                { mode: 'shared' as CodeMode, title: 'One code for everyone', sub: 'Every creator uses the same code' },
                {
                  mode: 'per_creator' as CodeMode,
                  title: 'A code for each creator',
                  sub: guestCount > 0
                    ? `One code covers them + their friend${guestCount > 1 ? 's' : ''}`
                    : 'Each creator gets their own code',
                },
                ...(guestCount > 0 ? [{
                  mode: 'per_person' as CodeMode,
                  title: 'A code for each person',
                  sub: `Each creator gets ${1 + guestCount} codes — one for them, one per friend`,
                }] : []),
              ]).map(opt => {
                const on = codeMode === opt.mode;
                return (
                  <TouchableOpacity
                    key={opt.mode}
                    style={[styles.optionCard, on && styles.optionCardSelected]}
                    onPress={() => setCodeMode(opt.mode)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{opt.title}</Text>
                      <Text style={styles.optionSub}>{opt.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {codeMode === 'shared' && (
                <>
                  <Text style={styles.label}>The code *</Text>
                  <TextInput
                    style={styles.input}
                    value={codes}
                    onChangeText={setCodes}
                    placeholder="e.g. SUMMER25"
                    placeholderTextColor={C.muted2}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </>
              )}

              {(codeMode === 'per_creator' || codeMode === 'per_person') && (() => {
                const perCreator = codesPerCreator(codeMode, guestCount);
                const needed = maxRedemptions ? maxRedemptions * perCreator : null;
                const added = parseCodes(codes).length;
                const fits = Math.floor(added / perCreator);
                return (
                  <>
                    <Text style={styles.label}>
                      {needed
                        ? `Paste ${needed} code${needed > 1 ? 's' : ''}${perCreator > 1 ? ` (${maxRedemptions} creators × ${perCreator} people)` : ''} *`
                        : 'Paste your codes *'}
                    </Text>
                    <Text style={styles.hint}>One code per line</Text>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      value={codes}
                      onChangeText={setCodes}
                      placeholder={'CODE001\nCODE002\nCODE003'}
                      placeholderTextColor={C.muted2}
                      multiline
                      numberOfLines={5}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    {needed != null && (
                      <View style={styles.codeCountRow}>
                        <Text style={[styles.codeCount, added >= needed && styles.codeCountOk]}>
                          {added >= needed ? '✓ ' : ''}{added} of {needed} added
                        </Text>
                        {added < needed && fits >= 1 && fits < (maxRedemptions ?? 0) && (
                          <TouchableOpacity onPress={() => setMaxRedemptions(fits)} activeOpacity={0.7}>
                            <Text style={styles.reduceLink}>Reduce to {fits} creator{fits > 1 ? 's' : ''}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                );
              })()}

              <Text style={styles.label}>Any notes or additional info for creators?</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={creatorNotes}
                onChangeText={setCreatorNotes}
                placeholder="Where to put the code at checkout, anyone you'd like them to connect with onsite, etc."
                placeholderTextColor={C.muted2}
                multiline
                numberOfLines={4}
              />
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
                  By publishing this opportunity, I commit to honoring it as described. Failure to do so may result in suspension or removal from Local Current.
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
              <Text style={styles.buttonText}>Next</Text>
              <Icon name="arrow" size={16} color="#fff" />
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
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.card,
    marginBottom: 20,
  },
  multiline: { height: 110, textAlignVertical: 'top' },

  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line2,
    borderRadius: R.md, padding: 14, marginBottom: 8,
  },
  optionCardSelected: { borderColor: C.accent, backgroundColor: C.accentTint },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.line2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.card,
  },
  radioOn: { borderColor: C.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  optionTitle: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  optionSub: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 2 },
  codeCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  codeCount: { fontFamily: F.bodySemi, fontSize: 13, color: C.muted },
  codeCountOk: { color: C.ok },
  reduceLink: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent, textDecorationLine: 'underline' },

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

  dateRow: { flexDirection: 'row', gap: 8 },
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
