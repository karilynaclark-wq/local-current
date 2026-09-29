import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, ScrollView, Image, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { countFilled, requestChipFor } from '../../types';
import { C, F, R, S } from '../../theme';
import { Icon, Mark } from '../../components/Icon';
import { Logo } from '../../components/Logo';
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

// ─── Platform / follower helpers (unchanged logic) ───────────────────────────
const FOLLOWER_RANK: Record<string, number> = {
  'Under 1K': 0, '1K–5K': 1, '5K–10K': 2, '10K–50K': 3, '50K–100K': 4, '100K+': 5,
};
function getTopSocialUrl(creator: any): string | null {
  const tikRank = FOLLOWER_RANK[creator.follower_range] ?? -1;
  const secRank = FOLLOWER_RANK[creator.secondary_follower_range] ?? -1;
  let usePrimary: boolean;
  if (tikRank > secRank) usePrimary = true;
  else if (secRank > tikRank) usePrimary = false;
  else usePrimary = creator.main_platform !== 'instagram';
  const preferIG = !usePrimary ? true : creator.main_platform === 'instagram';
  if (preferIG && creator.instagram_handle)
    return `https://www.instagram.com/${creator.instagram_handle.replace('@', '')}`;
  if (creator.tiktok_handle)
    return `https://www.tiktok.com/@${creator.tiktok_handle.replace('@', '')}`;
  if (creator.instagram_handle)
    return `https://www.instagram.com/${creator.instagram_handle.replace('@', '')}`;
  return null;
}
function getDisplayHandle(creator: any): string {
  const tikRank = FOLLOWER_RANK[creator.follower_range] ?? -1;
  const secRank = FOLLOWER_RANK[creator.secondary_follower_range] ?? -1;
  const preferIG = secRank > tikRank || (secRank === tikRank && creator.main_platform !== 'instagram');
  if (preferIG && creator.instagram_handle) return `@${creator.instagram_handle.replace('@', '')}`;
  if (creator.tiktok_handle) return `@${creator.tiktok_handle.replace('@', '')}`;
  if (creator.instagram_handle) return `@${creator.instagram_handle.replace('@', '')}`;
  return creator.name ?? '';
}

// ─── Status mapping helper ────────────────────────────────────────────────────
function redemptionStatus(status: string) {
  return requestChipFor(status, true);
}
function circuitStatus(item: any): 'active' | 'completed' | 'inactive' {
  if (item.is_active) return 'active';
  if (countFilled(item.redemptions) > 0) return 'completed';
  return 'inactive';
}

export default function MyCircuitsScreen() {
  const navigation = useNavigation<any>();
  const [role, setRole] = useState<'creator' | 'business' | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [otherCircuits, setOtherCircuits] = useState<any[]>([]);
  const [topCreators, setTopCreators] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRefreshing(false); return; }

    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setRole(prof?.role);

    if (prof?.role === 'creator') {
      const { data: creator } = await supabase.from('creators').select('id').eq('profile_id', user.id).single();
      if (creator) {
        const { data } = await supabase
          .from('redemptions')
          .select('*, circuit:circuits(*, business:businesses(*))')
          .eq('creator_id', creator.id)
          .order('claimed_at', { ascending: false });
        setItems(data ?? []);
      }
    } else {
      const { data: biz } = await supabase.from('businesses').select('id').eq('profile_id', user.id).single();
      if (biz) {
        const { data: circuitData } = await supabase
          .from('circuits')
          .select('*, business:businesses(business_name, address), redemptions(id, status)')
          .eq('business_id', biz.id)
          .order('created_at', { ascending: false });
        const sorted = (circuitData ?? []).sort((a: any, b: any) => {
          const rank = (c: any) => c.is_active ? 0 : countFilled(c.redemptions) > 0 ? 2 : 1;
          return rank(a) - rank(b);
        });
        setItems(sorted);

        const { data: others } = await supabase
          .from('circuits')
          .select('*, business:businesses(business_name)')
          .eq('is_active', true)
          .neq('business_id', biz.id)
          .order('created_at', { ascending: false });
        setOtherCircuits(others ?? []);

        const { data: creators } = await supabase
          .from('creators')
          .select('id, profile_id, tiktok_handle, instagram_handle, main_platform, follower_range, secondary_follower_range')
          .order('created_at', { ascending: false })
          .limit(20);

        if (creators && creators.length > 0) {
          const profileIds = creators.map((c: any) => c.profile_id).filter(Boolean);
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', profileIds);
          const profileMap: Record<string, any> = {};
          (profileRows ?? []).forEach((p: any) => { profileMap[p.id] = p; });
          setTopCreators(creators.map((c: any) => ({ ...c, profile: profileMap[c.profile_id] ?? null })));
        } else {
          setTopCreators([]);
        }
      }
    }
    setRefreshing(false);
  }

  // ─── Creator row card ───────────────────────────────────────────────────────
  function renderCreatorItem({ item }: { item: any }) {
    const biz = item.circuit?.business?.business_name;
    const status = redemptionStatus(item.status);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => navigation.navigate('MyRedemptions')}
      >
        {biz && <Text style={styles.cardEyebrow}>{biz.toUpperCase()}</Text>}
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { flex: 1, marginRight: 10 }]} numberOfLines={2}>
            {item.circuit?.title}
          </Text>
          <StatusChip status={status}/>
        </View>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}/>
          <View style={styles.linkRow}>
            <Text style={styles.linkText}>View details</Text>
            <Icon name="arrow" size={14} color={C.accent}/>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ─── Business circuit card ──────────────────────────────────────────────────
  function renderBusinessItem({ item }: { item: any }) {
    const live = circuitStatus(item) === 'active';
    return (
      <TouchableOpacity
        style={styles.bizCard}
        activeOpacity={0.88}
        onPress={() => navigation.navigate('BusinessCircuitDetail', { circuit: item })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.bizEyebrowRow}>
            <View style={[styles.statusDot, { backgroundColor: live ? C.ok : C.muted2 }]} />
            {!!item.business?.business_name && (
              <Text style={styles.bizEyebrow} numberOfLines={1}>{item.business.business_name.toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.bizTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        <View style={styles.chevronCircle}>
          <Icon name="chevron-right" size={14} color={C.accent} />
        </View>
      </TouchableOpacity>
    );
  }

  // ─── Business-only footer ───────────────────────────────────────────────────
  function BusinessFooter() {
    return (
      <View>
        {/* Top creators */}
        <Text style={styles.sectionTitle}>Top creators</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.creatorsScroll}
          contentContainerStyle={styles.creatorsScrollContent}
        >
          {topCreators.map(c => {
            const url = getTopSocialUrl(c);
            const handle = getDisplayHandle(c);
            const name = c.profile?.full_name ?? handle;
            const avatar = c.profile?.avatar_url;
            return (
              <TouchableOpacity
                key={c.id}
                style={styles.creatorChip}
                onPress={() => navigation.navigate('CreatorPublicProfile', { creatorId: c.id })}
                disabled={false}
                activeOpacity={0.8}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.creatorAvatar}/>
                ) : (
                  <View style={styles.creatorAvatarPlaceholder}>
                    <Text style={styles.creatorAvatarInitial}>
                      {name.replace('@', '').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.creatorHandle} numberOfLines={1}>{handle}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Other businesses */}
        <Text style={styles.sectionTitle}>What other local businesses are offering</Text>
        {otherCircuits.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyBoxTitle}>Nothing live right now</Text>
            <Text style={styles.emptyBoxSub}>New currents from nearby businesses will show up here.</Text>
          </View>
        ) : (
          otherCircuits.map(c => (
            <View key={c.id} style={styles.bizCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.bizEyebrowRow}>
                  <View style={[styles.statusDot, { backgroundColor: C.ok }]} />
                  <Text style={styles.bizEyebrow} numberOfLines={1}>{(c.business?.business_name ?? '').toUpperCase()}</Text>
                </View>
                <Text style={styles.bizTitle} numberOfLines={2}>{c.title}</Text>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 24 }}/>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, role === 'business' && { borderBottomWidth: 0 }]}>
        {role === 'business' ? <Logo size="sm" /> : <Text style={styles.screenTitle}>My claims</Text>}
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={role === 'creator' ? renderCreatorItem : renderBusinessItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={C.accent}/>
        }
        ListHeaderComponent={role === 'business' ? (
          <View style={styles.myCircuitsHeader}>
            <Text style={styles.myCircuitsHeaderText}>My currents</Text>
            {items.length > 0 && (
              <Text style={styles.activeCount}>{items.filter((c: any) => c.is_active).length} active</Text>
            )}
          </View>
        ) : null}
        ListEmptyComponent={role === 'creator' ? (
          <Text style={styles.empty}>No requests yet. Browse available currents to get started!</Text>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyBoxTitle}>No currents yet</Text>
            <Text style={styles.emptyBoxSub}>Tap Post to create your first current.</Text>
          </View>
        )}
        ListFooterComponent={role === 'business' ? <BusinessFooter/> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: C.paper, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  screenTitle: {
    fontFamily: F.display, fontWeight: '700', fontSize: 27,
    letterSpacing: -0.54, color: C.ink,
  },

  list: { padding: 16, gap: 0 },

  // Cards
  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: R.lg, padding: 16, marginBottom: 13,
    ...(S.card as any),
  },
  cardEyebrow: {
    fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4,
    color: C.muted2, marginBottom: 7,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: {
    fontFamily: F.display, fontWeight: '700', fontSize: 20,
    letterSpacing: -0.2, color: C.ink,
  },
  cardSub: {
    fontFamily: F.body, fontSize: 13.5, lineHeight: 19.5,
    color: C.muted, marginTop: 4,
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 13,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  locText: { fontFamily: F.body, fontSize: 12, color: C.muted2 },

  // Section headers
  myCircuitsHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingBottom: 12, paddingTop: 4,
  },
  myCircuitsHeaderText: {
    fontFamily: F.display, fontWeight: '700', fontSize: 18, color: C.ink,
  },
  activeCount: { fontFamily: F.body, fontSize: 13, color: C.muted },
  sectionTitle: {
    fontFamily: F.display, fontWeight: '700', fontSize: 18, color: C.ink,
    marginTop: 28, marginBottom: 12,
  },
  bizCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: R.lg, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 10,
  },
  bizEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  bizEyebrow: { fontFamily: F.monoBold, fontSize: 10.5, letterSpacing: 0.8, color: C.muted, flexShrink: 1 },
  bizTitle: { fontFamily: F.display, fontWeight: '700', fontSize: 16, letterSpacing: -0.2, color: C.ink },
  chevronCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentTint,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyBox: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: R.lg,
    paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 6,
  },
  emptyBoxTitle: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  emptyBoxSub: { fontFamily: F.body, fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginTop: 28, marginBottom: 12, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  sectionHeaderText: {
    fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.ink,
    flex: 1,
  },

  // Top creators
  creatorsScroll: { marginBottom: 4 },
  creatorsScrollContent: { paddingVertical: 4, gap: 14 },
  creatorChip: { alignItems: 'center', width: 72 },
  creatorAvatar: {
    width: 60, height: 60, borderRadius: 30, marginBottom: 6,
    borderWidth: 2, borderColor: C.card,
    // subtle ring
    shadowColor: C.line2, shadowOffset: { width: 0, height: 0 }, shadowRadius: 1.5, shadowOpacity: 1,
  },
  creatorAvatarPlaceholder: {
    width: 60, height: 60, borderRadius: 30, marginBottom: 6,
    // warm gradient placeholder
    backgroundColor: '#EADFCF',
    alignItems: 'center', justifyContent: 'center',
  },
  creatorAvatarInitial: {
    fontFamily: F.display, fontWeight: '700', fontSize: 22, color: C.accent,
  },
  creatorHandle: {
    fontFamily: F.body, fontSize: 11, color: C.muted,
    textAlign: 'center', width: 72,
  },

  // Other circuits cards
  otherEmpty: {
    fontFamily: F.body, fontSize: 13.5, color: C.muted,
    textAlign: 'center', marginTop: 8,
  },
  otherCard: {
    backgroundColor: C.card, borderRadius: R.md, padding: 15,
    marginBottom: 10, borderWidth: 1, borderColor: C.line,
    ...(S.card as any),
  },
  otherBiz: {
    fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4,
    color: C.muted2, marginBottom: 5,
  },
  otherTitle: {
    fontFamily: F.display, fontWeight: '700', fontSize: 17,
    letterSpacing: -0.17, color: C.ink, marginBottom: 4,
  },
  otherDesc: {
    fontFamily: F.body, fontSize: 13.5, color: C.muted, lineHeight: 19,
  },

  // Misc
  empty: {
    fontFamily: F.body, textAlign: 'center', color: C.muted,
    marginTop: 60, fontSize: 13.5, padding: 24, lineHeight: 20,
  },
} as any);
