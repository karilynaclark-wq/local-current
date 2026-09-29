import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, SectionList, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Circuit, requestChipFor, type RequestChip } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { StatusChip } from '../../components/UI';
import { isEligibleForCircuit, creatorFollowersByPlatform, creatorFollowerCounts, PlatformFollowerMap, PlatformCountMap } from '../../lib/eligibility';
import { getConnections } from '../../lib/socialConnect';

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

export default function CreatorHomeScreen() {
  const navigation = useNavigation<any>();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creatorFollowerRange, setCreatorFollowerRange] = useState('');
  const [creatorNiches, setCreatorNiches] = useState<string[]>([]);
  const [creatorFollowers, setCreatorFollowers] = useState<PlatformFollowerMap>({});
  const [creatorCounts, setCreatorCounts] = useState<PlatformCountMap>({});
  const [redemptionMap, setRedemptionMap] = useState<Record<string, { status: string; hasPost: boolean }>>({});
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);

  useEffect(() => { loadCreatorAndCircuits(); }, []);

  async function loadCreatorAndCircuits() {
    setRefreshing(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: creator } = await supabase
          .from('creators')
          .select('id, follower_range, niche, status, main_platform, secondary_platform, secondary_follower_range')
          .eq('profile_id', user.id)
          .single();
        if (creator) {
          setCreatorStatus(creator.status ?? null);
          setCreatorFollowerRange(creator.follower_range ?? '');
          setCreatorNiches(creator.niche ? creator.niche.split(',').map((n: string) => n.trim()) : []);
          const tiers = creatorFollowersByPlatform(creator);
          setCreatorFollowers(tiers);
          const conns = await getConnections().catch(() => []);
          setCreatorCounts(creatorFollowerCounts(tiers, conns));
          const { data: redemptions } = await supabase
            .from('redemptions')
            .select('circuit_id, status, posts(id)')
            .eq('creator_id', creator.id);
          const map: Record<string, { status: string; hasPost: boolean }> = {};
          for (const r of (redemptions ?? [])) {
            map[r.circuit_id] = { status: r.status, hasPost: (r.posts?.length ?? 0) > 0 };
          }
          setRedemptionMap(map);
        }
      }
      const now = new Date().toISOString();
      const { data, error: fetchError } = await supabase
        .from('circuits')
        .select('*, business:businesses(*)')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setCircuits(data ?? []);
    } catch (e: any) {
      setError('Could not load currents. Pull down to try again.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  const eligibleCircuits = circuits.filter(c => isEligibleForCircuit(c, creatorFollowerRange, creatorNiches, creatorFollowers, creatorCounts));
  const ineligibleCircuits = circuits.filter(c => !isEligibleForCircuit(c, creatorFollowerRange, creatorNiches, creatorFollowers, creatorCounts));

  const sections = [
    ...(eligibleCircuits.length > 0 ? [{ title: 'For you', data: eligibleCircuits, eligible: true }] : []),
    ...(ineligibleCircuits.length > 0 ? [{ title: 'Other opps', data: ineligibleCircuits, eligible: false }] : []),
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Logo size="sm" />
          <View style={{ flex: 1 }} />
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
        {navigation.canGoBack() && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="back" size={20} color={C.accent} />
          </TouchableOpacity>
        )}
        <Logo size="sm" />
        <View style={{ flex: 1 }} />
      </View>
      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={loadCreatorAndCircuits}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </TouchableOpacity>
      )}
      {creatorStatus === 'pending' && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>
            ⏳ Your account is being verified — you'll be notified within 24 hours. Once approved, you'll have access to eligible currents!
          </Text>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadCreatorAndCircuits} tintColor={C.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>No currents available right now. Check back soon!</Text>}
        renderSectionHeader={({ section }) => (
          sections.length > 1 ? (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          ) : null
        )}
        renderItem={({ item, section }) => {
          const raw = redemptionMap[item.id];
          // Withdrawn/expired requests can be requested again: show like a fresh current.
          const redemption = raw && (raw.status === 'cancelled' || raw.status === 'expired') ? undefined : raw;
          const fullyDone = redemption?.status === 'completed' && redemption?.hasPost;
          if (fullyDone) return null; // hide only after redemption + post both complete
          const neighborhood = neighborhoodFromAddress(item.business?.address);
          let chipStatus: RequestChip | 'active' | undefined;
          if (redemption) {
            chipStatus = requestChipFor(redemption.status, redemption.hasPost);
          } else if (section.eligible) {
            chipStatus = 'active';
          }
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('CircuitDetail', { circuit: item })}
              activeOpacity={0.88}
            >
              {item.business?.business_name && (
                <Text style={styles.cardEyebrow}>{item.business.business_name.toUpperCase()}</Text>
              )}
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { flex: 1, marginRight: 10 }]} numberOfLines={2}>{item.title}</Text>
                {chipStatus ? <StatusChip status={chipStatus} /> : null}
              </View>
              {!!item.description && (
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
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
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: C.paper, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  backBtn: { marginRight: 4 },
  logo: { fontFamily: F.display, fontWeight: '700', fontSize: 20, color: C.ink },
  list: { padding: 16 },
  sectionHeader: {
    fontFamily: F.mono, fontSize: 11, color: C.muted2,
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginBottom: 10, marginTop: 8,
  },
  card: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  cardEyebrow: {
    fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4,
    color: C.muted2, marginBottom: 7,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 18, letterSpacing: -0.2, color: C.ink },
  cardDesc: { fontFamily: F.body, fontSize: 13.5, color: C.muted, lineHeight: 19, marginTop: 6 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  locText: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  empty: { fontFamily: F.body, textAlign: 'center', color: C.muted, marginTop: 60, fontSize: 14, padding: 24, lineHeight: 20 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pendingBanner: {
    backgroundColor: C.accentTint,
    borderBottomWidth: 1,
    borderBottomColor: C.accentSoft,
    padding: 14,
    paddingHorizontal: 20,
  },
  pendingBannerText: {
    fontFamily: F.body,
    fontSize: 13.5,
    color: C.accent,
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2', borderBottomWidth: 1, borderBottomColor: '#FECACA',
    padding: 12, alignItems: 'center',
  },
  errorBannerText: { fontFamily: F.bodyMedium, fontSize: 13, color: '#991B1B' },
} as any);
