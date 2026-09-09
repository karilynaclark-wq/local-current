import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { UserRole } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';

export default function RoleSelectScreen() {
  const navigation = useNavigation<any>();

  function select(role: UserRole) {
    if (role === 'business') {
      navigation.navigate('BusinessOnboarding');
    } else {
      navigation.navigate('SignUp', { role });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
      <View style={styles.header}>
        <Logo size="lg" />
        <Text style={styles.subtitle}>Where local businesses connect with local creators for real impact</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity style={styles.card} onPress={() => select('creator')} activeOpacity={0.88}>
          <View style={styles.cardIconWrap}>
            <Icon name="film" size={26} color={C.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>I'm a Creator</Text>
            <Text style={styles.cardDesc}>Claim free experiences and create content for local businesses</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, styles.cardBusiness]} onPress={() => select('business')} activeOpacity={0.88}>
          <View style={[styles.cardIconWrap, { backgroundColor: C.accentTint }]}>
            <Icon name="storefront" size={26} color={C.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>I'm a Business</Text>
            <Text style={styles.cardDesc}>Post offers and get authentic content</Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
        <Text style={styles.signInLink}>Already have an account? <Text style={styles.signInLinkBold}>Sign in</Text></Text>
      </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  header: { alignItems: 'center', gap: 10, marginBottom: 32 },
  logo: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 36, letterSpacing: -0.8, color: C.ink },
  subtitle: { fontFamily: F.body, fontSize: 15, color: C.muted, textAlign: 'center' },
  cards: { gap: 16, marginBottom: 28 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: C.card, borderRadius: R.lg, padding: 20,
    borderWidth: 1.5, borderColor: C.line, ...(S.card as any),
  },
  cardBusiness: { borderColor: C.accent },
  cardIconWrap: {
    width: 56, height: 56, borderRadius: R.md,
    backgroundColor: C.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink, marginBottom: 4 },
  cardDesc: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20 },
  signInLink: { fontFamily: F.body, textAlign: 'center', color: C.muted, fontSize: 14 },
  signInLinkBold: { fontFamily: F.bodySemi, color: C.accent },
});
