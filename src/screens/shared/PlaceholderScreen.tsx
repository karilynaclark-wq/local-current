import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { C, F, R } from '../../theme';
import { Icon } from '../../components/Icon';

export default function PlaceholderScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const title = route.params?.title ?? 'Coming Soon';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Icon name="sparkles" size={40} color={C.muted2} />
        </View>
        <Text style={styles.label}>Coming soon</Text>
        <Text style={styles.sub}>This page is being prepared and will be available shortly.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { fontFamily: F.display, fontWeight: '700', fontSize: 18, color: C.ink },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  iconWrap: {
    width: 72, height: 72, borderRadius: R.lg,
    backgroundColor: C.line, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  label: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink },
  sub: { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22 },
});
