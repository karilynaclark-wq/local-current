// Event messages between a business and one creator (one thread per invite/claim).
// For changes, timing and problems — not a general chat. Open from the invite
// until 7 days after the event, then read-only. Long-press a message to report
// it; the ⋯ menu blocks/unblocks.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, Pressable, ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { notifyUser } from '../../lib/notifications';
import { threadUrl } from '../../lib/links';
import { trackEvent } from '../../lib/analytics';
import { C, F, R } from '../../theme';
import { Icon } from '../../components/Icon';

type Msg = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null };
type Thread = {
  creator_profile: string; business_profile: string; is_open: boolean; closes_at: string;
  circuit_id: string; circuit_title: string; business_name: string; creator_name: string;
};

const TEMPLATES = [
  'Heads up: the event is cancelled. Sorry about that!',
  'Heads up: the start time changed to ',
  'Your tickets are on the way. Check your email.',
  'Running late? Let us know and we\'ll hold your spot.',
];

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MessageThreadScreen() {
  const navigation = useNavigation<any>();
  const { redemptionId } = useRoute<any>().params as { redemptionId: string };
  const [me, setMe] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  const isBusiness = !!thread && me === thread.business_profile;
  const otherId = thread ? (isBusiness ? thread.creator_profile : thread.business_profile) : null;
  const otherName = thread ? (isBusiness ? thread.creator_name : thread.business_name) : '';

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setMe(user?.id ?? null);
    const [{ data: t }, { data: m }] = await Promise.all([
      supabase.rpc('message_thread', { p_redemption_id: redemptionId }),
      supabase.from('messages').select('id, sender_id, body, created_at, read_at')
        .eq('redemption_id', redemptionId).order('created_at'),
    ]);
    const th = (Array.isArray(t) ? t[0] : t) as Thread | undefined;
    setThread(th ?? null);
    setMsgs((m ?? []) as Msg[]);
    if (th && user) {
      const other = user.id === th.business_profile ? th.creator_profile : th.business_profile;
      const { data: b } = await supabase.from('message_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', other).maybeSingle();
      setBlocked(!!b);
    }
    setLoading(false);
    supabase.rpc('mark_thread_read', { p_redemption_id: redemptionId }).then(() => {});
  }, [redemptionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live: new messages in this thread.
  useEffect(() => {
    const ch = supabase.channel(`thread-${redemptionId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `redemption_id=eq.${redemptionId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
          supabase.rpc('mark_thread_read', { p_redemption_id: redemptionId }).then(() => {});
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [redemptionId]);

  useEffect(() => {
    if (msgs.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [msgs.length]);

  async function send(body = text) {
    const b = body.trim();
    if (!b || !thread || sending) return;
    setSending(true);
    const { data, error } = await supabase.rpc('send_message', { p_redemption_id: redemptionId, p_body: b });
    setSending(false);
    if (error) { Alert.alert("Couldn't send", error.message); return; }
    const m = data as Msg;
    setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
    setText('');
    trackEvent('message_sent', { role: isBusiness ? 'business' : 'creator' });
    if (otherId) {
      const from = isBusiness ? thread.business_name : thread.creator_name;
      notifyUser(otherId, `💬 ${from}`, `${thread.circuit_title}: ${b.slice(0, 140)}`, { url: threadUrl(redemptionId), kind: 'message' });
    }
  }

  function report(m: Msg) {
    Alert.alert('Report this message?', 'Our team will review it. You can also block them from the ⋯ menu.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('problem_reports').insert({
            circuit_id: thread?.circuit_id ?? null, report_type: 'message', message_id: m.id,
            details: `From ${m.sender_id === thread?.business_profile ? thread?.business_name : thread?.creator_name}: "${m.body}"`,
          });
          Alert.alert(error ? "Couldn't send report" : 'Thanks for letting us know', error ? error.message : "We'll take a look.");
        },
      },
    ]);
  }

  async function toggleBlock() {
    if (!otherId) return;
    if (blocked) {
      await supabase.rpc('unblock_user', { p_profile_id: otherId });
      setBlocked(false);
      return;
    }
    Alert.alert(`Block ${otherName}?`, "Neither of you will be able to send messages here. Your tickets and event aren't affected.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => { await supabase.rpc('block_user', { p_profile_id: otherId }); setBlocked(true); } },
    ]);
  }

  function reportThread() {
    setMenuOpen(false);
    supabase.from('problem_reports').insert({ circuit_id: thread?.circuit_id ?? null, report_type: 'message_thread', details: `Thread ${redemptionId} with ${otherName}` })
      .then(({ error }) => Alert.alert(error ? "Couldn't send report" : 'Thanks for letting us know', error ? error.message : "We'll take a look."));
  }

  const closed = !!thread && !thread.is_open;
  const closesStr = thread ? new Date(thread.closes_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }) : '';

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="back" size={20} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={st.title} numberOfLines={1}>{otherName || 'Messages'}</Text>
          {!!thread && <Text style={st.sub} numberOfLines={1}>{thread.circuit_title}</Text>}
        </View>
        <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={10} disabled={!thread}>
          <Icon name="more" size={22} color={C.ink} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={C.accent} /></View>
      ) : !thread ? (
        <View style={st.center}><Text style={st.empty}>This conversation isn't available.</Text></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={m => m.id}
            contentContainerStyle={st.list}
            ListHeaderComponent={
              <View style={st.note}>
                <Text style={st.noteText}>
                  Use this for event changes, timing or problems. Keep it about this event.
                  {thread.is_open ? ` Messages close ${closesStr}.` : ''}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === me;
              return (
                <TouchableOpacity activeOpacity={0.9} onLongPress={() => !mine && report(item)} delayLongPress={350}
                  style={[st.bubbleRow, mine ? { justifyContent: 'flex-end' } : null]}>
                  <View style={[st.bubble, mine ? st.mine : st.theirs]}>
                    <Text style={[st.bubbleText, mine && { color: '#fff' }]}>{item.body}</Text>
                    <Text style={[st.bubbleTime, mine && { color: 'rgba(255,255,255,0.75)' }]}>{timeLabel(item.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={st.empty}>No messages yet.</Text>}
          />

          {closed ? (
            <View style={st.closed}><Text style={st.closedText}>This conversation closed {closesStr}. Need help? Email hello@localcurrentapp.com.</Text></View>
          ) : blocked ? (
            <View style={st.closed}><Text style={st.closedText}>You blocked {otherName}. Unblock from the ⋯ menu to send messages.</Text></View>
          ) : (
            <>
              {isBusiness && msgs.length === 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
                  contentContainerStyle={st.templates} keyboardShouldPersistTaps="handled">
                  {TEMPLATES.map(t => (
                    <TouchableOpacity key={t} style={st.template} onPress={() => setText(t)}>
                      <Text style={st.templateText} numberOfLines={1}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <View style={st.composer}>
                <TextInput
                  style={st.input} value={text} onChangeText={setText} placeholder={`Message ${otherName}`}
                  placeholderTextColor={C.muted2} multiline maxLength={1000}
                />
                <TouchableOpacity style={[st.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} onPress={() => send()} disabled={!text.trim() || sending}>
                  <Icon name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      )}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={st.sheet}>
            <TouchableOpacity style={st.sheetRow} onPress={() => { setMenuOpen(false); setTimeout(toggleBlock, 250); }}>
              <Text style={[st.sheetText, !blocked && { color: '#C0392B' }]}>{blocked ? `Unblock ${otherName}` : `Block ${otherName}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sheetRow} onPress={reportThread}>
              <Text style={st.sheetText}>Report a problem</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.sheetRow, { borderBottomWidth: 0 }]} onPress={() => setMenuOpen(false)}>
              <Text style={[st.sheetText, { color: C.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { fontFamily: F.bodySemi, fontSize: 16, color: C.ink },
  sub: { fontFamily: F.body, fontSize: 12.5, color: C.muted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 12 },
  list: { padding: 16, gap: 6, flexGrow: 1 },
  note: { backgroundColor: C.accentTint, borderRadius: R.md, padding: 12, marginBottom: 10 },
  noteText: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.inkSoft, textAlign: 'center' },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { backgroundColor: C.accent, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink },
  bubbleTime: { fontFamily: F.body, fontSize: 11, color: C.muted2, marginTop: 3 },
  templates: { paddingHorizontal: 12, paddingBottom: 8, gap: 8, alignItems: 'center' },
  template: { borderWidth: 1.5, borderColor: C.line2, backgroundColor: C.card, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, maxWidth: 260, alignSelf: 'center' },
  templateText: { fontFamily: F.body, fontSize: 13, color: C.ink },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper },
  input: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line2, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30, paddingTop: 6 },
  sheetRow: { paddingVertical: 17, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line },
  sheetText: { fontFamily: F.bodySemi, fontSize: 16, color: C.ink },
  closed: { padding: 16, borderTopWidth: 1, borderTopColor: C.line },
  closedText: { fontFamily: F.body, fontSize: 13.5, color: C.muted, textAlign: 'center' },
} as any);
