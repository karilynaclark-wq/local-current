// Post-sign-up welcome pages (creators and businesses). The first page is the
// "You're in!" welcome, the middle pages explain how it works (with progress
// dots), and the last page asks for notification permission.

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { trackEvent } from '../lib/analytics';
import { C, F, R, S } from '../theme';
import { Icon } from './Icon';
import { registerForPushNotifications } from '../lib/notifications';

export interface WelcomePage {
  icon: any;
  title: string;
  body: string;
  cta: string;
}

export default function WelcomeFlow({ pages, firstName, onDone, role }: {
  pages: WelcomePage[];
  role: 'creator' | 'business';
  firstName?: string;
  /** Called after the last page (notifications asked or skipped). */
  onDone: () => void | Promise<void>;
}) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { trackEvent('welcome_page_viewed', { role, page: i + 1, title: pages[i].title }); }, [i]);
  const page = pages[i];
  const last = i === pages.length - 1;
  const tipCount = pages.length - 2;           // pages between welcome and notifications
  const isTip = i >= 1 && i <= tipCount;

  async function finish(askForNotifications: boolean) {
    setBusy(true);
    trackEvent('welcome_completed', { role, notifications: askForNotifications });
    if (askForNotifications) await registerForPushNotifications(true).catch(() => null);
    await onDone();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.welcome}>
        <View style={styles.dots}>
          {isTip && Array.from({ length: tipCount }, (_, k) => k + 1).map(k => (
            <View key={k} style={[styles.dot, k === i && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.body}>
          <View style={styles.icon}><Icon name={page.icon} size={34} color={C.accent} /></View>
          <Text style={styles.title}>{i === 0 && firstName ? `You're in, ${firstName}!` : page.title}</Text>
          <Text style={styles.text}>{page.body}</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, busy && { opacity: 0.6 }]}
          onPress={() => (last ? finish(true) : setI(i + 1))}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>{page.cta}</Text>
        </TouchableOpacity>
        {last ? (
          <TouchableOpacity onPress={() => finish(false)} style={styles.notNow} disabled={busy}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        ) : <View style={styles.notNow} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  welcome: { flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, height: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.line2 },
  dotOn: { width: 22, backgroundColor: C.accent },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  icon: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 30, letterSpacing: -0.6, color: C.ink, textAlign: 'center' },
  text: { fontFamily: F.body, fontSize: 16, lineHeight: 24, color: C.inkSoft, textAlign: 'center', maxWidth: 320 },
  button: { backgroundColor: C.accent, borderRadius: R.btn, padding: 16, alignItems: 'center', ...(S.button as any) },
  buttonText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  notNow: { alignItems: 'center', paddingVertical: 14, minHeight: 46 },
  notNowText: { fontFamily: F.bodySemi, fontSize: 14, color: C.muted },
} as any);
