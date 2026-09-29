import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, FlatList, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { requestChipFor } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';
import { StatusChip } from '../../components/UI';

const ZIP_TO_NEIGHBORHOOD: Record<string, string> = {
  '60601': 'The Loop', '60602': 'The Loop', '60603': 'The Loop', '60604': 'The Loop',
  '60605': 'South Loop', '60606': 'The Loop', '60607': 'West Loop', '60608': 'Pilsen',
  '60609': 'Back of the Yards', '60610': 'Gold Coast', '60611': 'Streeterville',
  '60612': 'West Garfield Park', '60613': 'Lakeview', '60614': 'Lincoln Park',
  '60615': 'Hyde Park', '60616': 'Chinatown', '60617': 'South Chicago',
  '60618': 'Irving Park', '60619': 'Chatham', '60620': 'Auburn Gresham',
  '60621': 'Englewood', '60622': 'Wicker Park', '60623': 'Little Village',
  '60624': 'Garfield Park', '60625': 'Albany Park', '60626': 'Rogers Park',
  '60628': 'Roseland', '60629': 'Chicago Lawn', '60630': 'Jefferson Park',
  '60631': 'Norwood Park', '60632': 'Brighton Park', '60633': 'Hegewisch',
  '60634': 'Dunning', '60636': 'West Englewood', '60637': 'Woodlawn',
  '60638': 'Garfield Ridge', '60639': 'Belmont Cragin', '60640': 'Uptown',
  '60641': 'Hermosa', '60642': 'River North', '60643': 'Morgan Park',
  '60644': 'Austin', '60645': 'West Rogers Park', '60646': 'Norwood Park',
  '60647': 'Logan Square', '60649': 'South Shore', '60651': 'Humboldt Park',
  '60652': 'Ashburn', '60653': 'Bronzeville', '60654': 'River North',
  '60655': 'Mount Greenwood', '60656': 'Norwood Park', '60657': 'Lakeview',
  '60659': 'West Ridge', '60660': 'Edgewater', '60661': 'West Loop',
};

function neighborhoodFromAddress(address?: string): string | null {
  if (!address) return null;
  const match = address.match(/\b(606\d{2})\b/);
  return match ? (ZIP_TO_NEIGHBORHOOD[match[1]] ?? null) : null;
}

function chipStatusFor(r: any) {
  return requestChipFor(r.status, (r.posts?.length ?? 0) > 0);
}

export default function MyRedemptionsScreen() {
  const navigation = useNavigation<any>();
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { fetchRedemptions(); }, []));

  async function fetchRedemptions() {
    setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRefreshing(false); setLoading(false); return; }
    const { data: creator } = await supabase.from('creators').select('id').eq('profile_id', user.id).single();
    if (!creator) { setRefreshing(false); setLoading(false); return; }
    const { data } = await supabase
      .from('redemptions')
      .select('id, status, circuit:circuits(*, business:businesses(*)), posts(id)')
      .eq('creator_id', creator.id)
      .order('claimed_at', { ascending: false });
    setRedemptions(data ?? []);
    setRefreshing(false);
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Currents</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Currents</Text>
      </View>
      <FlatList
        data={redemptions}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchRedemptions} tintColor={C.accent} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No requests yet. Browse available currents to get started!</Text>
        }
        renderItem={({ item: r }) => {
          const circuit = r.circuit;
          const neighborhood = neighborhoodFromAddress(circuit?.business?.address);
          const chip = chipStatusFor(r);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('CircuitDetail', { circuit })}
              activeOpacity={0.88}
            >
              {circuit?.business?.business_name && (
                <Text style={styles.eyebrow}>{circuit.business.business_name.toUpperCase()}</Text>
              )}
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { flex: 1, marginRight: 10 }]} numberOfLines={2}>{circuit?.title}</Text>
                <StatusChip status={chip} />
              </View>
              {!!circuit?.description && (
                <Text style={styles.cardDesc} numberOfLines={2}>{circuit.description}</Text>
              )}
              {neighborhood && (
                <View style={styles.locRow}>
                  <Icon name="pin" size={13} color={C.muted2} />
                  <Text style={styles.locText}>{neighborhood}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  header: { padding: 20, backgroundColor: C.paper, borderBottomWidth: 1, borderBottomColor: C.line },
  headerTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.3, color: C.ink },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 0 },
  card: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 18,
    marginBottom: 13, borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  eyebrow: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4, color: C.muted2, marginBottom: 5, textTransform: 'uppercase' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 18, letterSpacing: -0.2, color: C.ink },
  cardDesc: { fontFamily: F.body, fontSize: 13.5, color: C.muted, lineHeight: 19, marginBottom: 8 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locText: { fontFamily: F.body, fontSize: 12.5, color: C.muted2 },
  empty: { fontFamily: F.body, textAlign: 'center', color: C.muted, marginTop: 60, fontSize: 14, padding: 24, lineHeight: 20 },
} as any);
