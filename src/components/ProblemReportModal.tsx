// "Report a problem" sheet for businesses (about an event, optionally one
// creator) and for anyone from Settings (general). Saves to problem_reports,
// which emails the Local Current inbox.

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { C, F, R, S } from '../theme';

const EVENT_OPTIONS = [
  { value: 'creator_no_show', label: "A creator didn't show up" },
  { value: 'creator_no_post', label: "A creator didn't post" },
  { value: 'post_problem', label: 'A post was inaccurate or inappropriate' },
  { value: 'code_misused', label: 'Ticket code was misused or shared' },
  { value: 'other', label: 'Something else' },
];
const GENERAL_OPTIONS = [
  { value: 'bug', label: "Something in the app isn't working" },
  { value: 'account', label: 'A problem with my account' },
  { value: 'user_behavior', label: 'A problem with another user' },
  { value: 'other', label: 'Something else' },
];

export interface ReportCreatorOption { id: string; name: string }

export default function ProblemReportModal({ visible, onClose, circuitId, creators = [] }: {
  visible: boolean;
  onClose: () => void;
  /** Set when reporting about an event; omit for a general report. */
  circuitId?: string;
  /** Creators on the event, so the business can say who it's about. */
  creators?: ReportCreatorOption[];
}) {
  const [type, setType] = useState('');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const options = circuitId ? EVENT_OPTIONS : GENERAL_OPTIONS;
  const aboutCreator = !!circuitId && (type.startsWith('creator_') || type === 'post_problem' || type === 'code_misused');

  useEffect(() => { if (visible) { setType(''); setCreatorId(null); setDetails(''); } }, [visible]);

  async function submit() {
    if (!type) { Alert.alert('Pick an option', 'Choose what happened.'); return; }
    if (type === 'other' && !details.trim()) { Alert.alert('Add a few details', 'Tell us what happened.'); return; }
    setSaving(true);
    const { error } = await supabase.from('problem_reports').insert({
      circuit_id: circuitId ?? null,
      creator_id: aboutCreator ? creatorId : null,
      report_type: type,
      details: details.trim() || null,
    });
    setSaving(false);
    if (error) { Alert.alert('Could not send', error.message); return; }
    trackEvent('problem_reported', { type, scope: circuitId ? 'event' : 'general' });
    Alert.alert('Thanks for letting us know', "We'll look into it and get back to you by email.");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={st.title}>Report a problem</Text>
              <Text style={st.sub}>What happened?</Text>
              {options.map(o => (
                <TouchableOpacity key={o.value} style={[st.option, type === o.value && st.optionOn]}
                  onPress={() => setType(o.value)} activeOpacity={0.8}>
                  <View style={[st.radio, type === o.value && st.radioOn]} />
                  <Text style={[st.optionText, type === o.value && st.optionTextOn]}>{o.label}</Text>
                </TouchableOpacity>
              ))}

              {aboutCreator && creators.length > 0 && (
                <>
                  <Text style={st.label}>Which creator?</Text>
                  <View style={st.chips}>
                    {creators.map(c => (
                      <TouchableOpacity key={c.id} style={[st.chip, creatorId === c.id && st.chipOn]}
                        onPress={() => setCreatorId(creatorId === c.id ? null : c.id)} activeOpacity={0.8}>
                        <Text style={[st.chipText, creatorId === c.id && st.chipTextOn]}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TextInput style={st.input} value={details} onChangeText={setDetails}
                placeholder={type === 'other' ? 'Tell us what happened' : 'Any details (optional)'}
                placeholderTextColor={C.muted2} multiline maxLength={1000} />

              <TouchableOpacity style={[st.submit, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
                <Text style={st.submitText}>{saving ? 'Sending…' : 'Send report'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.cancel} onPress={onClose}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 40, maxHeight: '90%' },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 20, color: C.ink, marginBottom: 4 },
  sub: { fontFamily: F.body, fontSize: 14, color: C.muted, marginBottom: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.md, marginBottom: 8, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.paper },
  optionOn: { borderColor: C.accent, backgroundColor: C.accentTint },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.line2 },
  radioOn: { borderColor: C.accent, backgroundColor: C.accent },
  optionText: { fontFamily: F.body, fontSize: 14, color: C.ink, flex: 1 },
  optionTextOn: { fontFamily: F.bodySemi, color: C.accent },
  label: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.ink, marginTop: 10, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.paper },
  chipOn: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.body, fontSize: 13, color: C.ink },
  chipTextOn: { fontFamily: F.bodySemi, color: C.accent },
  input: { fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, padding: 13, fontSize: 14, color: C.ink, backgroundColor: C.paper, textAlignVertical: 'top', minHeight: 80, marginTop: 14 },
  submit: { backgroundColor: C.accent, borderRadius: R.btn, padding: 15, alignItems: 'center', marginTop: 16, ...(S.button as any) },
  submitText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  cancel: { alignItems: 'center', padding: 14 },
  cancelText: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted },
} as any);
