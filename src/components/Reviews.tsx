// Two-way reviews: the rating sheet (1–5 stars, optional note, "post anonymously"
// checked by default) and the reviews section shown on profiles.

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { C, F, R, S } from '../theme';
import { Icon } from './Icon';

const GOLD = '#C39A3A';

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Icon key={n} name={n <= Math.round(value) ? 'star-fill' : 'star'} size={size} color={GOLD} />
      ))}
    </View>
  );
}

/** kind 'creator' = a business rating a creator; 'business' = a creator rating a business. */
export function RatingModal({ visible, kind, redemptionId, name, initial, onClose, onSaved }: {
  visible: boolean;
  kind: 'creator' | 'business';
  redemptionId: string;
  name: string;
  initial?: { rating?: number | null; note?: string | null; anonymous?: boolean | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRating(initial?.rating ?? 0);
    setNote(initial?.note ?? '');
    setAnonymous(initial?.anonymous ?? true);
  }, [visible]);

  async function save() {
    if (!rating) { Alert.alert('Pick a rating', 'Tap 1 to 5 stars.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc(kind === 'creator' ? 'rate_creator' : 'rate_business', {
      p_redemption_id: redemptionId, p_rating: rating, p_note: note, p_anonymous: anonymous,
    });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    trackEvent(kind === 'creator' ? 'creator_rated' : 'business_rated', { rating, anonymous });
    onSaved();
    onClose();
  }

  const about = kind === 'creator' ? 'working with them' : 'your experience with them';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={st.title}>Rate {name}</Text>
              <Text style={st.sub}>How was {about}?</Text>

              <View style={st.starsRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7} hitSlop={6}>
                    <Icon name={n <= rating ? 'star-fill' : 'star'} size={36} color={GOLD} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.label}>Add a note <Text style={st.optional}>(optional)</Text></Text>
              <TextInput
                style={st.input}
                value={note}
                onChangeText={setNote}
                placeholder={kind === 'creator' ? 'What was it like working with them?' : 'What was the experience like?'}
                placeholderTextColor={C.muted2}
                multiline
                maxLength={500}
              />

              <TouchableOpacity style={st.checkRow} onPress={() => setAnonymous(a => !a)} activeOpacity={0.7}>
                <View style={[st.box, anonymous && st.boxOn]}>
                  {anonymous && <Icon name="check" size={13} color="#fff" stroke={3} />}
                </View>
                <Text style={st.checkText}>Post anonymously</Text>
              </TouchableOpacity>

              <Text style={st.fine}>
                Your review shows on {name}'s profile{anonymous ? ' without your name' : ' with your name'}.
                It's about {kind === 'creator' ? 'the creator' : 'the business'}, not the Local Current app.
              </Text>

              <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                <Text style={st.saveText}>{saving ? 'Saving…' : 'Submit review'}</Text>
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

interface Review { rating: number; note: string | null; reviewer: string | null; event_title: string | null; rated_at: string }

/** Reviews of a creator (from businesses) or of a business (from creators). Hidden when there are none. */
export function ReviewsSection({ kind, id }: { kind: 'creator' | 'business'; id: string | null | undefined }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  useEffect(() => {
    if (!id) return;
    supabase.rpc(kind === 'creator' ? 'creator_reviews' : 'business_reviews',
      kind === 'creator' ? { p_creator_id: id } : { p_business_id: id })
      .then(({ data }) => setReviews((data as Review[]) ?? []));
  }, [kind, id]);

  if (!reviews.length) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const withNotes = reviews.filter(r => r.note);

  return (
    <View style={st.section}>
      <View style={st.sumRow}>
        <Text style={st.avg}>{avg.toFixed(1)}</Text>
        <Stars value={avg} size={16} />
        <Text style={st.count}>{reviews.length} review{reviews.length === 1 ? '' : 's'}</Text>
      </View>
      {withNotes.slice(0, 5).map((r, i) => (
        <View key={i} style={st.review}>
          <View style={st.reviewTop}>
            <Stars value={r.rating} size={12} />
            <Text style={st.who}>
              {r.reviewer ?? (kind === 'creator' ? 'A business' : 'A creator')}{r.event_title ? ` · ${r.event_title}` : ''}
            </Text>
          </View>
          <Text style={st.note}>{r.note}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 40, maxHeight: '90%' },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 22, color: C.ink, marginBottom: 4 },
  sub: { fontFamily: F.body, fontSize: 14.5, color: C.muted, marginBottom: 18 },
  starsRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  label: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.ink, marginBottom: 8, marginTop: 18 },
  optional: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md, padding: 13,
    fontSize: 14, color: C.ink, backgroundColor: C.paper, textAlignVertical: 'top', minHeight: 90,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkText: { fontFamily: F.bodySemi, fontSize: 14.5, color: C.ink },
  fine: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 10 },
  saveBtn: { backgroundColor: C.accent, borderRadius: R.btn, padding: 16, alignItems: 'center', marginTop: 22, ...(S.button as any) },
  saveText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  cancel: { alignItems: 'center', padding: 14 },
  cancelText: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted },
  section: { alignSelf: 'stretch', gap: 10, marginTop: 4 },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  avg: { fontFamily: F.display, fontWeight: '700', fontSize: 17, color: C.ink },
  count: { fontFamily: F.body, fontSize: 13, color: C.muted },
  review: { backgroundColor: C.card, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, padding: 12, gap: 6 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  who: { fontFamily: F.bodySemi, fontSize: 12.5, color: C.muted },
  note: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.inkSoft },
} as any);
