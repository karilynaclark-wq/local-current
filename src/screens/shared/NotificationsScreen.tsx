// The bell list: every alert we've sent you (same as push), newest first.
// Opening it marks everything read. Rows open the same place the push would.

import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { parseAppLink } from '../../lib/links';
import { useAuth } from '../../hooks/useAuth';
import { C, F, R } from '../../theme';
import { Icon } from '../../components/Icon';

type Row = { id: string; title: string; body: string; url: string | null; kind: string | null; read_at: string | null; created_at: string };

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });
}

function iconFor(r: Row): any {
  const k = r.kind ?? parseAppLink(r.url)?.kind;
  if (k === 'message' || k === 'thread') return 'chat';
  if (k === 'new_event' || k === 'event') return 'ticket';
  if (k === 'manage') return 'clipboard';
  return 'bell';
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const { data } = await supabase.from('notifications')
      .select('id, title, body, url, kind, read_at, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(200);
    setRows((data ?? []) as Row[]);
    setLoading(false);
    setRefreshing(false);
    supabase.rpc('mark_notifications_read').then(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function open(r: Row) {
    const link = parseAppLink(r.url);
    if (!link) return;
    const role = profile?.role;
    if ((link.kind === 'event' || link.kind === 'manage') && link.id) {
      const { data: circuit } = await supabase.from('circuits').select('*, business:businesses(*)').eq('id', link.id).maybeSingle();
      if (!circuit) { Alert.alert('Not available', 'This event is no longer available.'); return; }
      navigation.navigate(role === 'business' ? 'BusinessCircuitDetail' : 'CircuitDetail', { circuit });
      return;
    }
    if (link.kind === 'thread' && link.id) { navigation.navigate('MessageThread', { redemptionId: link.id }); return; }
    if (link.kind === 'post' && role === 'business') { navigation.getParent()?.navigate('PostTab', { screen: 'PostIntro' }); return; }
    navigation.goBack();
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="back" size={20} color={C.accent} />
        </TouchableOpacity>
        <Text style={st.title}>Notifications</Text>
        <View style={{ width: 20 }} />
      </View>
      {loading ? (
        <View style={st.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          contentContainerStyle={rows.length ? st.list : st.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={st.center}>
              <Icon name="bell" size={30} color={C.muted2} />
              <Text style={st.emptyTitle}>No notifications yet</Text>
              <Text style={st.emptyText}>Updates about your events and messages show up here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={[st.row, !item.read_at && st.rowUnread]} onPress={() => open(item)} activeOpacity={0.7}>
              <View style={st.iconTile}><Icon name={iconFor(item)} size={18} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <View style={st.topLine}>
                  <Text style={st.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={st.time}>{ago(item.created_at)}</Text>
                </View>
                {!!item.body && <Text style={st.body} numberOfLines={3}>{item.body}</Text>}
              </View>
              {!item.read_at && <View style={st.unreadDot} />}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title: { fontFamily: F.display, fontWeight: '700', fontSize: 18, color: C.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  list: { paddingVertical: 6 },
  emptyWrap: { flexGrow: 1 },
  emptyTitle: { fontFamily: F.bodySemi, fontSize: 16, color: C.ink, marginTop: 6 },
  emptyText: { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: 'flex-start' },
  rowUnread: { backgroundColor: C.accentTint },
  iconTile: { width: 36, height: 36, borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  topLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowTitle: { flex: 1, fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  time: { fontFamily: F.body, fontSize: 12, color: C.muted2 },
  body: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.inkSoft, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent, marginTop: 6 },
} as any);
