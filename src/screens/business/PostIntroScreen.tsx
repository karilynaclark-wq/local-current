import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

const STEPS: { num: number; title: string; desc: string }[] = [
  { num: 1, title: 'Post an offer', desc: "Describe what event you'd like creators to attend." },
  { num: 2, title: 'We match creators', desc: "It's shown to eligible creators in your city." },
  { num: 3, title: 'They visit & film', desc: 'Creators claim the offer, come by, and capture a video.' },
  { num: 4, title: 'It goes live', desc: 'They post to TikTok or Instagram, tagging you.' },
  { num: 5, title: 'You see results', desc: "Get notified when it's live and track performance." },
];

export default function PostIntroScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>How it works</Text>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.step}>
              {/* Left: number bubble + connector line */}
              <View style={styles.stepLeft}>
                <View style={styles.numBubble}>
                  <Text style={styles.numText}>{step.num}</Text>
                </View>
                {i < STEPS.length - 1 && <View style={styles.connector} />}
              </View>
              {/* Right: title + description */}
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('CreateCircuit')} activeOpacity={0.9}>
        <Icon name="plus" size={18} color="#fff" />
        <Text style={styles.buttonText}>Post a current</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper, paddingVertical: 24 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 30, letterSpacing: -0.6, color: C.ink, marginBottom: 36 },

  steps: { gap: 0 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },

  stepLeft: { alignItems: 'center', width: 36 },
  numBubble: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center',
  },
  numText: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.accent },
  connector: { width: 1.5, flex: 1, minHeight: 24, backgroundColor: C.line2, marginVertical: 4 },

  stepBody: { flex: 1, paddingTop: 6, paddingBottom: 24 },
  stepTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: C.ink, marginBottom: 4 },
  stepDesc: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20 },

  button: {
    backgroundColor: C.accent, borderRadius: R.btn, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 8, marginHorizontal: 28, ...(S.button as any),
  },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
} as any);
