import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

export default function PostSubmittedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { redemptionId, businessName } = route.params ?? {};

  const [rating, setRating] = useState(0);
  const [publicFeedback, setPublicFeedback] = useState('');
  const [anonymousFeedback, setAnonymousFeedback] = useState('');
  const [appFeedback, setAppFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleComplete() {
    setSubmitting(true);
    try {
      if (redemptionId && (rating || publicFeedback || anonymousFeedback || appFeedback)) {
        await supabase.from('redemption_feedback').insert({
          redemption_id: redemptionId,
          rating: rating || null,
          public_feedback: publicFeedback || null,
          anonymous_feedback: anonymousFeedback || null,
          app_feedback: appFeedback || null,
        });
      }
    } catch (_) {
      // feedback is optional
    } finally {
      setSubmitting(false);
      navigation.getParent()?.navigate('ProfileTab');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.headerCard}>
            <Icon name="sparkles" size={36} color={C.accent} />
            <Text style={styles.title}>Post submitted!</Text>
            <Text style={styles.subtitle}>
              The business can now see how your content is performing.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>How would you rate working with {businessName ?? 'the business'}?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
                <Icon name={n <= rating ? 'star-fill' : 'star'} size={36} color="#C39A3A" />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Public feedback</Text>
          <Text style={styles.sectionHint}>Visible to the business and other creators</Text>
          <TextInput
            style={styles.textArea}
            value={publicFeedback}
            onChangeText={setPublicFeedback}
            placeholder="Share your experience with this business..."
            placeholderTextColor={C.muted2}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.sectionLabel}>Anonymous feedback</Text>
          <Text style={styles.sectionHint}>Only visible to the business — your name is hidden</Text>
          <TextInput
            style={styles.textArea}
            value={anonymousFeedback}
            onChangeText={setAnonymousFeedback}
            placeholder="Anything you'd share privately with the business..."
            placeholderTextColor={C.muted2}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.sectionLabel}>App feedback</Text>
          <Text style={styles.sectionHint}>Let us know how we can improve!</Text>
          <TextInput
            style={styles.textArea}
            value={appFeedback}
            onChangeText={setAppFeedback}
            placeholder="How can we make Current better for you?"
            placeholderTextColor={C.muted2}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={submitting}
          >
            <Text style={styles.buttonText}>{submitting ? 'Saving…' : 'Complete Current'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.getParent()?.navigate('ProfileTab')}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  scroll: { padding: 24, paddingBottom: 48 },
  headerCard: {
    backgroundColor: C.accentTint, borderRadius: R.lg, padding: 24,
    alignItems: 'center', marginBottom: 32, gap: 10,
    borderWidth: 1, borderColor: C.accentSoft,
  },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 24, letterSpacing: -0.4, color: C.ink, textAlign: 'center' },
  subtitle: { fontFamily: F.body, fontSize: 15, color: C.accent, textAlign: 'center', lineHeight: 22 },
  sectionLabel: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink, marginTop: 24, marginBottom: 4 },
  sectionHint: { fontFamily: F.body, fontSize: 12, color: C.muted2, marginBottom: 8 },
  stars: { flexDirection: 'row', gap: 6, marginBottom: 4, paddingVertical: 4 },
  textArea: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 14, fontSize: 14, color: C.ink, minHeight: 90, backgroundColor: C.card,
  },
  button: {
    backgroundColor: C.accent, borderRadius: R.btn,
    padding: 16, alignItems: 'center', marginTop: 32, ...(S.button as any),
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  skipBtn: { alignItems: 'center', marginTop: 16 },
  skipText: { fontFamily: F.body, color: C.muted2, fontSize: 14, textDecorationLine: 'underline' },
});
