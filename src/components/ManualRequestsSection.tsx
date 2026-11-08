// "You pick" currents (business side): creators who tapped "I'm interested",
// Approve / Pass, and the approval sheet where the business chooses how the
// creator gets tickets (promo code, guest list, or email).

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Image, Alert,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { Circuit, FILLED_STATUSES } from '../types';
import { C, F, R, S } from '../theme';

type Method = 'code' | 'guest_list' | 'email';
const METHODS: { value: Method; label: string; sub: string }[] = [
  { value: 'code', label: 'Promo code', sub: 'They redeem it on your ticket site.' },
  { value: 'guest_list', label: 'Guest list', sub: "You add them to the door list. They show ID at the door." },
  { value: 'email', label: 'Email tickets', sub: "You email the tickets to them. We'll share their email." },
];
const METHOD_LABEL: Record<Method, string> = { code: 'Promo code', guest_list: 'Guest list', email: 'Email' };

/** '2026-11-22' → 'Sat, Nov 22' (no timezone shift). */
const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const handleOf = (c: any) => {
  const h = c?.tiktok_handle || c?.instagram_handle;
  return h ? `@${String(h).replace('@', '')}` : (c?.profile?.full_name ?? 'Creator');
};

export default function ManualRequestsSection({ circuit, redemptions, onChanged }: {
  circuit: Circuit;
  redemptions: any[];
  onChanged: () => void;
}) {
  const navigation = useNavigation<any>();
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState<any | null>(null);
  const [method, setMethod] = useState<Method>('code');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [going, setGoing] = useState<string | null>(null);
  const recurring = circuit.schedule_type === 'recurring';

  const requested = redemptions.filter(r => r.status === 'requested')
    .sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? ''));
  const approved = redemptions.filter(r => FILLED_STATUSES.includes(r.status) && r.delivery_method);
  const spots = circuit.max_redemptions ?? 0;
  const filled = redemptions.filter(r => FILLED_STATUSES.includes(r.status)).length;
  const full = spots > 0 && filled >= spots;
  const tickets = (circuit.guest_count ?? 1) + 1;
  const deadline = circuit.request_deadline ? new Date(circuit.request_deadline) : null;

  useEffect(() => {
    supabase.rpc('approved_creator_emails', { p_circuit_id: circuit.id }).then(({ data }) => {
      const m: Record<string, string> = {};
      for (const r of (data ?? []) as any[]) m[r.redemption_id] = r.email;
      setEmails(m);
    });
  }, [circuit.id, redemptions]);

  function openApprove(r: any) {
    if (full) { Alert.alert('All spots filled', `You've already approved ${spots} creator${spots === 1 ? '' : 's'}.`); return; }
    const last = approved[approved.length - 1];
    setMethod((last?.delivery_method as Method) ?? 'code');
    setCode(last?.delivery_method === 'code' ? last.code ?? '' : '');
    setGoing(r.preferred_dates?.length === 1 ? r.preferred_dates[0] : null);
    setApproving(r);
  }

  async function approve() {
    if (!approving) return;
    if (recurring && !going) { Alert.alert('Pick a date', 'Choose which of their dates they\'re going.'); return; }
    if (method === 'code' && !code.trim()) { Alert.alert('Add the code', 'Type the promo code this creator will use.'); return; }
    setBusy(true);
    const { data: email, error } = await supabase.rpc('approve_request', {
      p_redemption_id: approving.id, p_method: method, p_code: method === 'code' ? code.trim() : null, p_going: recurring ? going : null,
    });
    setBusy(false);
    if (error) { Alert.alert('Could not approve', error.message); return; }
    trackEvent('request_approved', { circuit_id: circuit.id, method });
    const who = handleOf(approving.creator);
    const name = approving.creator?.profile?.full_name || who;
    setApproving(null);
    onChanged();
    if (method === 'guest_list') {
      Alert.alert('Approved', `Add ${name}${tickets > 1 ? ` +${tickets - 1}` : ''} to your guest list${going ? ` for ${fmtDay(going)}` : ''}.${email ? `\n\nTheir email: ${email}` : ''}\n\nThey have up to 72 hours to confirm.`);
    } else if (method === 'email') {
      Alert.alert('Approved', `Email ${tickets} ticket${tickets === 1 ? '' : 's'} to ${email ?? 'them'}.\n\nThey have up to 72 hours to confirm.`);
    } else {
      Alert.alert('Approved', `${who} has the code. They have up to 72 hours to confirm.`);
    }
  }

  function pass(r: any) {
    Alert.alert(`Pass on ${handleOf(r.creator)}?`, "They'll hear back when your event starts.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pass', style: 'destructive', onPress: async () => {
          const { error } = await supabase.rpc('pass_request', { p_redemption_id: r.id });
          if (error) { Alert.alert('Error', error.message); return; }
          trackEvent('request_passed', { circuit_id: circuit.id });
          onChanged();
        },
      },
    ]);
  }

  const Avatar = ({ c }: { c: any }) => c?.profile?.avatar_url
    ? <Image source={{ uri: c.profile.avatar_url }} style={st.avatar} />
    : <View style={[st.avatar, st.avatarEmpty]}><Text style={st.initial}>{handleOf(c).replace('@', '').charAt(0).toUpperCase()}</Text></View>;

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={st.headRow}>
        <Text style={st.title}>Interested creators</Text>
        <Text style={st.count}>{spots ? `${filled} of ${spots} picked` : `${filled} picked`}</Text>
      </View>
      {deadline && (
        <Text style={st.sub}>
          {deadline > new Date() ? 'Creators can ask until ' : 'Requests closed '}
          {deadline.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}. You can approve anytime.
        </Text>
      )}

      {requested.length === 0 ? (
        <Text style={st.empty}>No one yet. We'll notify you as creators ask for tickets.</Text>
      ) : requested.map(r => (
        <View key={r.id} style={st.card}>
          <TouchableOpacity style={st.who} onPress={() => r.creator && navigation.navigate('CreatorPublicProfile', { creatorId: r.creator.id })} activeOpacity={0.7}>
            <Avatar c={r.creator} />
            <View style={{ flex: 1 }}>
              <Text style={st.handle}>{handleOf(r.creator)}</Text>
              <Text style={st.meta}>{r.creator?.follower_range ? `${r.creator.follower_range} followers · ` : ''}View profile ›</Text>
            </View>
          </TouchableOpacity>
          {recurring && !!r.preferred_dates?.length && (
            <View style={st.datesRow}>
              <Text style={st.datesLabel}>Can go</Text>
              <Text style={st.datesText}>{r.preferred_dates.map(fmtDay).join(' · ')}</Text>
              {!!r.preference_note && <Text style={st.prefNote}>"{r.preference_note}"</Text>}
            </View>
          )}
          <View style={st.actions}>
            <TouchableOpacity style={st.passBtn} onPress={() => pass(r)}><Text style={st.passText}>Pass</Text></TouchableOpacity>
            <TouchableOpacity style={[st.approveBtn, full && { opacity: 0.5 }]} onPress={() => openApprove(r)}>
              <Text style={st.approveText}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {approved.length > 0 && (
        <>
          <Text style={[st.title, { marginTop: 18, marginBottom: 8 }]}>Approved</Text>
          {approved.map(r => {
            const email = emails[r.id];
            return (
              <View key={r.id} style={st.card}>
                <View style={st.who}>
                  <Avatar c={r.creator} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.handle}>{handleOf(r.creator)}</Text>
                    <Text style={st.meta}>
                      {METHOD_LABEL[r.delivery_method as Method]}
                      {r.delivery_method === 'code' && r.code ? ` · ${r.code}` : ''}
                      {r.delivery_method === 'guest_list' ? ` · ${r.creator?.profile?.full_name ?? ''}${tickets > 1 ? ` +${tickets - 1}` : ''}` : ''}
                    </Text>
                    {recurring && r.going_on ? <Text style={st.goingText}>Going {fmtDay(r.going_on)}</Text> : null}
                    {!!email && (
                      <Text style={st.email} onPress={() => Linking.openURL(`mailto:${email}`)}
                        onLongPress={() => { Clipboard.setStringAsync(email); Alert.alert('Copied', email); }}>{email}</Text>
                    )}
                  </View>
                  <View style={[st.pill, r.confirmed_at ? st.pillOk : st.pillWait]}>
                    <Text style={[st.pillText, r.confirmed_at ? { color: C.ok } : { color: '#92400E' }]}>
                      {r.confirmed_at || r.status !== 'approved' ? 'Confirmed' : 'Waiting'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
          <Text style={st.sub}>Creators have up to 72 hours to confirm. If they don't, the spot opens back up.</Text>
        </>
      )}

      <Modal visible={!!approving} transparent animationType="slide" onRequestClose={() => setApproving(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={st.overlay}>
            <View style={st.sheet}>
              <Text style={st.sheetTitle}>Approve {handleOf(approving?.creator)}</Text>
              {recurring && !!approving?.preferred_dates?.length && (
                <>
                  <Text style={st.sheetSub}>Which date are they going?</Text>
                  <View style={st.dateChips}>
                    {(approving.preferred_dates as string[]).map(d => (
                      <TouchableOpacity key={d} style={[st.dateChip, going === d && st.dateChipOn]} onPress={() => setGoing(d)}>
                        <Text style={[st.dateChipText, going === d && { color: '#fff' }]}>{fmtDay(d)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {!!approving.preference_note && <Text style={[st.prefNote, { marginBottom: 12 }]}>"{approving.preference_note}"</Text>}
                </>
              )}
              <Text style={st.sheetSub}>How will they get their {tickets} ticket{tickets === 1 ? '' : 's'}?</Text>
              {METHODS.map(m => (
                <TouchableOpacity key={m.value} style={[st.option, method === m.value && st.optionOn]} onPress={() => setMethod(m.value)} activeOpacity={0.85}>
                  <View style={[st.radio, method === m.value && st.radioOn]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.optionLabel, method === m.value && { color: C.accent }]}>{m.label}</Text>
                    <Text style={st.optionSub}>{m.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {method === 'code' && (
                <TextInput style={st.input} value={code} onChangeText={setCode} placeholder="Promo code"
                  placeholderTextColor={C.muted2} autoCapitalize="characters" autoCorrect={false} />
              )}
              <TouchableOpacity style={[st.save, busy && { opacity: 0.6 }]} onPress={approve} disabled={busy}>
                <Text style={st.saveText}>{busy ? 'Approving…' : 'Approve'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.cancel} onPress={() => setApproving(null)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontFamily: F.display, fontWeight: '700', fontSize: 17, color: C.ink },
  count: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  sub: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginBottom: 10, lineHeight: 17 },
  empty: { fontFamily: F.body, fontSize: 13.5, color: C.muted2, paddingVertical: 12 },
  card: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8, gap: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarEmpty: { backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: F.display, fontWeight: '700', color: C.accent },
  handle: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  meta: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 1 },
  email: { fontFamily: F.bodySemi, fontSize: 12.5, color: C.accent, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  passBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.btn, borderWidth: 1.5, borderColor: C.line2 },
  passText: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted },
  approveBtn: { flex: 2, alignItems: 'center', paddingVertical: 10, borderRadius: R.btn, backgroundColor: C.accent },
  approveText: { fontFamily: F.bodySemi, fontSize: 14, color: '#fff' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillOk: { backgroundColor: '#DCEAD5' },
  pillWait: { backgroundColor: '#FEF3C7' },
  pillText: { fontFamily: F.bodySemi, fontSize: 11.5 },
  datesRow: { backgroundColor: C.paper, borderRadius: R.sm, padding: 10, gap: 2 },
  datesLabel: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.muted2, textTransform: 'uppercase' },
  datesText: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.ink },
  prefNote: { fontFamily: F.body, fontSize: 12.5, color: C.muted, fontStyle: 'italic' },
  goingText: { fontFamily: F.bodySemi, fontSize: 12.5, color: C.ink, marginTop: 2 },
  dateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  dateChip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.paper },
  dateChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  dateChipText: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.ink },
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 20, color: C.ink },
  sheetSub: { fontFamily: F.body, fontSize: 14, color: C.muted, marginTop: 4, marginBottom: 14 },
  option: { flexDirection: 'row', gap: 12, padding: 13, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.paper, marginBottom: 8 },
  optionOn: { borderColor: C.accent, backgroundColor: C.accentTint },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.line2, marginTop: 2 },
  radioOn: { borderColor: C.accent, backgroundColor: C.accent },
  optionLabel: { fontFamily: F.bodySemi, fontSize: 14.5, color: C.ink },
  optionSub: { fontFamily: F.body, fontSize: 12.5, color: C.muted, marginTop: 2 },
  input: { fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, padding: 13, fontSize: 15, color: C.ink, backgroundColor: C.paper, marginTop: 4 },
  save: { backgroundColor: C.accent, borderRadius: R.btn, padding: 15, alignItems: 'center', marginTop: 16, ...(S.button as any) },
  saveText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  cancel: { alignItems: 'center', padding: 14 },
  cancelText: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted },
} as any);
