import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';

const LIVE_GREEN = '#3F8F5B';
const LIVE_GREEN_TINT = '#E7F1E9';

const STEPS: { icon: any; title: string; desc: string; notify: boolean }[] = [
  { icon: 'film', title: 'A creator claims it', desc: 'They redeem their ticket and attend.', notify: true },
  { icon: 'sparkles', title: 'They post their review', desc: 'Real video content, straight to their page.', notify: true },
  { icon: 'eye', title: 'You track the results', desc: 'Views, reach and visits, all in one place.', notify: false },
];

export default function CircuitLiveScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Icon name="sparkles" size={40} color={LIVE_GREEN} />
          </View>
          <Text style={styles.title}>Your Current is live!</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Visible to creators now</Text>
          </View>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepLeft}>
                <View style={styles.stepIcon}>
                  <Icon name={step.icon} size={22} color={C.accent} />
                </View>
                {i < STEPS.length - 1 && <View style={styles.connector} />}
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
                {step.notify && (
                  <View style={styles.notifyPill}>
                    <Icon name="bell" size={13} color={C.accent} />
                    <Text style={styles.notifyText}>We'll notify you</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('MyCircuitsTab')} activeOpacity={0.9}>
        <Text style={styles.buttonText}>View my currents</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper, paddingVertical: 24 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },

  header: { alignItems: 'center', marginBottom: 40 },
  iconWrap: {
    width: 88, height: 88, borderRadius: R.lg,
    backgroundColor: LIVE_GREEN_TINT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 30, letterSpacing: -0.6, color: C.ink, textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: LIVE_GREEN },
  statusText: { fontFamily: F.mono, fontSize: 12, color: C.muted2, textTransform: 'uppercase', letterSpacing: 1.5 },

  steps: { gap: 0 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  stepLeft: { alignItems: 'center', width: 48 },
  stepIcon: {
    width: 48, height: 48, borderRadius: R.md,
    backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center',
  },
  connector: { width: 1.5, flex: 1, minHeight: 24, backgroundColor: C.line2, marginVertical: 4 },
  stepBody: { flex: 1, paddingTop: 4, paddingBottom: 24 },
  stepTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 17, color: C.ink, marginBottom: 4 },
  stepDesc: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20 },
  notifyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: C.accentTint, borderRadius: R.pill,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 10,
  },
  notifyText: { fontFamily: F.mono, fontSize: 12, color: C.accent, letterSpacing: 0.3 },

  button: {
    backgroundColor: C.accent, borderRadius: R.btn, padding: 16,
    alignItems: 'center', marginBottom: 16, marginHorizontal: 28, ...(S.button as any),
  },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
} as any);
