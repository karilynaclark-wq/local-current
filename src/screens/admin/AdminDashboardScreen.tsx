import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, Alert, ScrollView,
  Modal, TextInput, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';
import { C, F, R, S } from '../../theme';
import { Icon } from '../../components/Icon';
import { getPushToken, sendPush } from '../../lib/notifications';

interface PendingCreator {
  id: string;
  profile_id: string;
  bio: string;
  instagram_handle: string;
  tiktok_handle: string;
  follower_range: string;
  secondary_platform: string;
  secondary_handle: string;
  secondary_follower_range: string;
  city: string;
  zip_code: string;
  outside_chicago: boolean;
  niche: string;
  profile: { full_name: string; email: string };
}

interface PendingChange {
  id: string;
  instagram_handle: string;
  tiktok_handle: string;
  follower_range: string;
  secondary_follower_range: string;
  pending_follower_range: string;
  pending_secondary_follower_range: string;
  profile: { full_name: string; email: string };
}

interface CreatorHealth {
  id: string;
  instagram_handle: string;
  tiktok_handle: string;
  follower_range: string;
  no_show_count: number;
  late_post_count: number;
  missed_post_count: number;
  total_claims: number;
  overdue_posts: number;
  profile: { full_name: string; email: string };
}

interface ProblemReport {
  id: string;
  creator_id: string | null;
  problem_report_type: string;
  problem_report_details: string | null;
  problem_reported_at: string;
  circuit: { title: string; business: { business_name: string } };
  creator: { id: string; instagram_handle: string; tiktok_handle: string; profile: { full_name: string } } | null;
}

interface AdminPost {
  id: string;
  video_url: string;
  platform: string;
  submitted_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  redemption_id: string;
  creator_id: string;
  redemption: {
    circuit: { title: string; business: { business_name: string } };
    creator: { instagram_handle: string; tiktok_handle: string; profile: { full_name: string } };
  };
}

type Tab = 'applications' | 'changes' | 'health' | 'reports' | 'posts';

export default function AdminDashboardScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('applications');
  const [creators, setCreators] = useState<PendingCreator[]>([]);
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [health, setHealth] = useState<CreatorHealth[]>([]);
  const [reports, setReports] = useState<ProblemReport[]>([]);
  const [adminPosts, setAdminPosts] = useState<AdminPost[]>([]);
  const [editingPost, setEditingPost] = useState<AdminPost | null>(null);
  const [statsDraft, setStatsDraft] = useState({ views: '', likes: '', comments: '' });
  const [savingStats, setSavingStats] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setRefreshing(true);
    const [
      { data: pending },
      { data: pendingChanges },
      { data: allCreators },
      { data: redemptionRows },
      { data: reportRows },
    ] = await Promise.all([
      supabase
        .from('creators')
        .select('*, profile:profiles(full_name, email)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('creators')
        .select('id, instagram_handle, tiktok_handle, follower_range, secondary_follower_range, pending_follower_range, pending_secondary_follower_range, profile:profiles(full_name, email)')
        .not('pending_follower_range', 'is', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('creators')
        .select('id, instagram_handle, tiktok_handle, follower_range, no_show_count, late_post_count, missed_post_count, profile:profiles(full_name, email)')
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),
      supabase
        .from('redemptions')
        .select('id, creator_id, status, checked_in_at, redeemed_at'),
      supabase
        .from('redemptions')
        .select('id, creator_id, problem_report_type, problem_report_details, problem_reported_at, circuit:circuits(title, business:businesses(business_name))')
        .not('problem_report_type', 'is', null)
        .order('problem_reported_at', { ascending: false }),
    ]);

    setCreators(pending ?? []);
    setChanges(pendingChanges ?? []);

    // Fetch creators for reports separately to avoid RLS blocking nested joins
    const reportCreatorIds = [...new Set((reportRows ?? []).map((r: any) => r.creator_id).filter(Boolean))];
    const { data: reportCreatorRows } = reportCreatorIds.length > 0
      ? await supabase.from('creators').select('id, instagram_handle, tiktok_handle, profile:profiles(full_name)').in('id', reportCreatorIds)
      : { data: [] as any[] };
    const reportCreatorById: Record<string, any> = {};
    (reportCreatorRows ?? []).forEach((c: any) => { reportCreatorById[c.id] = c; });

    setReports(
      (reportRows ?? []).map((r: any) => ({
        ...r,
        creator: r.creator_id ? (reportCreatorById[r.creator_id] ?? null) : null,
      })) as any
    );

    // Build health stats per creator
    const now = Date.now();
    const OVERDUE_MS = 48 * 60 * 60 * 1000;
    const redemptions = redemptionRows ?? [];

    const healthData: CreatorHealth[] = (allCreators ?? []).map((c: any) => {
      const mine = redemptions.filter((r: any) => r.creator_id === c.id);
      const totalClaims = mine.length;
      const overdue = mine.filter((r: any) => {
        if (r.status === 'completed') return false;
        if (!r.checked_in_at) return false;
        return (now - new Date(r.checked_in_at).getTime()) > OVERDUE_MS;
      }).length;
      return {
        ...c,
        total_claims: totalClaims,
        overdue_posts: overdue,
        no_show_count: c.no_show_count ?? 0,
        late_post_count: c.late_post_count ?? 0,
        missed_post_count: c.missed_post_count ?? 0,
      };
    });

    // Sort: flagged creators first
    healthData.sort((a, b) => {
      const aFlag = (a.no_show_count + a.late_post_count + a.missed_post_count + a.overdue_posts) > 0 ? 0 : 1;
      const bFlag = (b.no_show_count + b.late_post_count + b.missed_post_count + b.overdue_posts) > 0 ? 0 : 1;
      return aFlag - bFlag;
    });

    setHealth(healthData);

    const { data: postRows } = await supabase
      .from('posts')
      .select('id, video_url, platform, submitted_at, views, likes, comments, redemption_id, creator_id')
      .order('submitted_at', { ascending: false });

    if ((postRows ?? []).length > 0) {
      const redemptionIds = (postRows ?? []).map((p: any) => p.redemption_id).filter(Boolean);
      const creatorIds = (postRows ?? []).map((p: any) => p.creator_id).filter(Boolean);

      const [{ data: redemptionData }, { data: creatorData }] = await Promise.all([
        supabase.from('redemptions').select('id, circuit:circuits(title, business:businesses(business_name))').in('id', redemptionIds),
        supabase.from('creators').select('id, instagram_handle, tiktok_handle, profile:profiles(full_name)').in('id', creatorIds),
      ]);

      const redemptionMap: Record<string, any> = {};
      (redemptionData ?? []).forEach((r: any) => { redemptionMap[r.id] = r; });
      const creatorMap: Record<string, any> = {};
      (creatorData ?? []).forEach((c: any) => { creatorMap[c.id] = c; });

      const merged = (postRows ?? []).map((p: any) => ({
        ...p,
        redemption: {
          circuit: redemptionMap[p.redemption_id]?.circuit ?? null,
          creator: creatorMap[p.creator_id] ?? null,
        },
      }));
      setAdminPosts(merged as any);
    } else {
      setAdminPosts([]);
    }

    setRefreshing(false);
  }

  async function handleSaveStats() {
    if (!editingPost) return;
    setSavingStats(true);
    const { error } = await supabase.from('posts').update({
      views: statsDraft.views ? parseInt(statsDraft.views) : null,
      likes: statsDraft.likes ? parseInt(statsDraft.likes) : null,
      comments: statsDraft.comments ? parseInt(statsDraft.comments) : null,
    }).eq('id', editingPost.id);
    setSavingStats(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setAdminPosts(prev => prev.map(p => p.id === editingPost.id ? {
      ...p,
      views: statsDraft.views ? parseInt(statsDraft.views) : null,
      likes: statsDraft.likes ? parseInt(statsDraft.likes) : null,
      comments: statsDraft.comments ? parseInt(statsDraft.comments) : null,
    } : p));
    setEditingPost(null);
  }

  async function updateStatus(id: string, status: 'approved' | 'rejected') {
    const { data: creator } = await supabase.from('creators').select('profile_id').eq('id', id).single();
    const { error } = await supabase.from('creators').update({ status }).eq('id', id);
    if (error) { Alert.alert('Error', error.message); return; }
    if (creator?.profile_id) {
      const token = await getPushToken(creator.profile_id);
      if (token) {
        if (status === 'approved') {
          sendPush(token, "You're in! 🎉", "Your Local Current application was approved. Start browsing currents in your area.");
        } else {
          sendPush(token, 'Application update', "Unfortunately your Local Current application wasn't approved at this time.");
        }
      }
    }
    fetchAll();
  }

  async function approveChange(item: PendingChange) {
    const { error } = await supabase.from('creators').update({
      follower_range: item.pending_follower_range,
      secondary_follower_range: item.pending_secondary_follower_range,
      pending_follower_range: null,
      pending_secondary_follower_range: null,
    }).eq('id', item.id);
    if (error) { Alert.alert('Error', error.message); return; }
    fetchAll();
  }

  async function rejectChange(id: string) {
    const { error } = await supabase.from('creators').update({
      pending_follower_range: null,
      pending_secondary_follower_range: null,
    }).eq('id', id);
    if (error) { Alert.alert('Error', error.message); return; }
    fetchAll();
  }

  function renderCreator(item: PendingCreator) {
    return (
      <View key={item.id} style={styles.card}>
        <Text style={styles.name}>{item.profile?.full_name}</Text>
        <Text style={styles.email}>{item.profile?.email}</Text>
        <View style={styles.detailRow}>
          <Icon name="pin" size={13} color={C.muted2} />
          <Text style={styles.detail}>
            {item.city}{item.zip_code ? ` ${item.zip_code}` : ''}
            {item.outside_chicago ? '  · Outside Chicago' : ''}
          </Text>
        </View>
        {item.instagram_handle ? (
          <View style={styles.detailRow}>
            <Icon name="film" size={13} color={C.muted2} />
            <Text style={styles.detail}>{item.instagram_handle} · {item.follower_range}</Text>
          </View>
        ) : null}
        {item.tiktok_handle ? (
          <View style={styles.detailRow}>
            <Icon name="phone" size={13} color={C.muted2} />
            <Text style={styles.detail}>{item.tiktok_handle} · {item.secondary_follower_range}</Text>
          </View>
        ) : null}
        {item.bio ? <Text style={styles.bio} numberOfLines={2}>{item.bio}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.approveBtn} onPress={() => updateStatus(item.id, 'approved')}>
            <Icon name="check" size={15} color="#fff" />
            <Text style={styles.approveBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => updateStatus(item.id, 'rejected')}>
            <Icon name="close" size={15} color={C.muted} />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderChange(item: PendingChange) {
    return (
      <View key={item.id} style={styles.card}>
        <Text style={styles.name}>{item.profile?.full_name}</Text>
        <Text style={styles.email}>{item.profile?.email}</Text>
        {item.instagram_handle ? (
          <View style={styles.changeRow}>
            <View style={styles.changeHeaderRow}>
              <Icon name="film" size={13} color={C.muted2} />
              <Text style={styles.changeLabel}>{item.instagram_handle}</Text>
            </View>
            <View style={styles.changeValues}>
              <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>{item.follower_range ?? '—'}</Text></View>
              <Icon name="arrow" size={13} color={C.muted2} />
              <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>{item.pending_follower_range}</Text></View>
            </View>
          </View>
        ) : null}
        {item.tiktok_handle ? (
          <View style={styles.changeRow}>
            <View style={styles.changeHeaderRow}>
              <Icon name="phone" size={13} color={C.muted2} />
              <Text style={styles.changeLabel}>{item.tiktok_handle}</Text>
            </View>
            <View style={styles.changeValues}>
              <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>{item.secondary_follower_range ?? '—'}</Text></View>
              <Icon name="arrow" size={13} color={C.muted2} />
              <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>{item.pending_secondary_follower_range ?? '—'}</Text></View>
            </View>
          </View>
        ) : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.approveBtn} onPress={() => approveChange(item)}>
            <Icon name="check" size={15} color="#fff" />
            <Text style={styles.approveBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectChange(item.id)}>
            <Icon name="close" size={15} color={C.muted} />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderHealth(item: CreatorHealth) {
    const hasFlags = item.no_show_count > 0 || item.late_post_count > 0 || item.missed_post_count > 0 || item.overdue_posts > 0;
    return (
      <View key={item.id} style={[styles.card, hasFlags && styles.cardFlagged]}>
        <View style={styles.healthHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.profile?.full_name}</Text>
            <Text style={styles.email}>{item.profile?.email}</Text>
            <Text style={styles.detail}>
              {item.instagram_handle || item.tiktok_handle} · {item.follower_range}
            </Text>
          </View>
          {hasFlags && (
            <View style={styles.flagBadge}>
              <Icon name="close" size={12} color="#fff" />
              <Text style={styles.flagBadgeText}>Flagged</Text>
            </View>
          )}
        </View>
        <View style={styles.healthStats}>
          <View style={styles.healthStat}>
            <Text style={styles.healthStatNum}>{item.total_claims}</Text>
            <Text style={styles.healthStatLabel}>Claims</Text>
          </View>
          <View style={styles.healthStat}>
            <Text style={[styles.healthStatNum, item.no_show_count > 0 && styles.statRed]}>{item.no_show_count}</Text>
            <Text style={[styles.healthStatLabel, item.no_show_count > 0 && styles.statRed]}>No-shows</Text>
          </View>
          <View style={styles.healthStat}>
            <Text style={[styles.healthStatNum, item.overdue_posts > 0 && styles.statRed]}>{item.overdue_posts}</Text>
            <Text style={[styles.healthStatLabel, item.overdue_posts > 0 && styles.statRed]}>Overdue</Text>
          </View>
          <View style={styles.healthStat}>
            <Text style={[styles.healthStatNum, item.missed_post_count > 0 && styles.statRed]}>{item.missed_post_count}</Text>
            <Text style={[styles.healthStatLabel, item.missed_post_count > 0 && styles.statRed]}>Missed</Text>
          </View>
          <View style={styles.healthStat}>
            <Text style={[styles.healthStatNum, item.late_post_count > 0 && styles.statRed]}>{item.late_post_count}</Text>
            <Text style={[styles.healthStatLabel, item.late_post_count > 0 && styles.statRed]}>Late</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderReport(item: ProblemReport) {
    const typeLabel: Record<string, string> = {
      not_honored: "Business didn't honor voucher",
      negative_experience: 'Negative experience',
      other: 'Other',
    };
    const date = new Date(item.problem_reported_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return (
      <View key={item.id} style={[styles.card, styles.cardFlagged]}>
        <View style={styles.reportHeader}>
          <Text style={styles.reportType}>{typeLabel[item.problem_report_type] ?? item.problem_report_type}</Text>
          <Text style={styles.reportDate}>{date}</Text>
        </View>
        <Text style={styles.name}>{(item.creator as any)?.profile?.full_name ?? 'Unknown creator'}</Text>
        <Text style={styles.detail}>
          Re: {(item.circuit as any)?.title} · {(item.circuit as any)?.business?.business_name}
        </Text>
        {item.problem_report_details ? (
          <Text style={styles.reportDetails}>"{item.problem_report_details}"</Text>
        ) : null}
      </View>
    );
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'applications', label: 'Applications', count: creators.length || undefined },
    { key: 'changes', label: 'Count changes', count: changes.length || undefined },
    { key: 'health', label: 'Creator health', count: health.filter(h => h.no_show_count + h.late_post_count + h.missed_post_count + h.overdue_posts > 0).length || undefined },
    { key: 'reports', label: 'Reports', count: reports.length || undefined },
    { key: 'posts', label: 'Posts', count: adminPosts.length || undefined },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}{t.count ? ` (${t.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchAll} tintColor={C.accent} />}
      >
        {activeTab === 'applications' && (
          creators.length === 0
            ? <Text style={styles.empty}>No pending applications</Text>
            : creators.map(c => renderCreator(c))
        )}
        {activeTab === 'changes' && (
          changes.length === 0
            ? <Text style={styles.empty}>No pending count changes</Text>
            : changes.map(c => renderChange(c))
        )}
        {activeTab === 'health' && (
          health.length === 0
            ? <Text style={styles.empty}>No approved creators yet</Text>
            : health.map(c => renderHealth(c))
        )}
        {activeTab === 'reports' && (
          reports.length === 0
            ? <Text style={styles.empty}>No problem reports</Text>
            : reports.map(r => renderReport(r))
        )}
        {activeTab === 'posts' && (
          adminPosts.length === 0
            ? <Text style={styles.empty}>No posts yet</Text>
            : adminPosts.map(post => {
                const r = (post as any).redemption;
                const creatorName = r?.creator?.profile?.full_name ?? 'Creator';
                const handle = r?.creator?.instagram_handle || r?.creator?.tiktok_handle || '';
                const bizName = r?.circuit?.business?.business_name ?? '';
                const circuitTitle = r?.circuit?.title ?? '';
                const postedDate = post.submitted_at ? new Date(post.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                const hasStats = post.views != null || post.likes != null || post.comments != null;
                return (
                  <View key={post.id} style={[styles.card, !hasStats && styles.cardFlagged]}>
                    <View style={styles.postCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{creatorName}</Text>
                        {!!handle && <Text style={styles.email}>@{handle}</Text>}
                        <Text style={styles.detail}>{bizName} · {circuitTitle}</Text>
                        <Text style={[styles.detail, { marginTop: 2 }]}>{post.platform}{postedDate ? ` · ${postedDate}` : ''}</Text>
                      </View>
                      {!hasStats && (
                        <View style={styles.needsStatsBadge}>
                          <Text style={styles.needsStatsBadgeText}>No stats</Text>
                        </View>
                      )}
                    </View>
                    {hasStats && (
                      <View style={styles.postStatsRow}>
                        {[
                          { label: 'Views', val: post.views },
                          { label: 'Likes', val: post.likes },
                          { label: 'Comments', val: post.comments },
                        ].map(s => (
                          <View key={s.label} style={styles.postStatBox}>
                            <Text style={styles.postStatNum}>{(s.val ?? 0).toLocaleString()}</Text>
                            <Text style={styles.postStatLabel}>{s.label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => Linking.openURL(post.video_url)} activeOpacity={0.8}>
                        <Text style={styles.rejectBtnText}>Open post</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => {
                          setEditingPost(post);
                          setStatsDraft({
                            views: post.views != null ? String(post.views) : '',
                            likes: post.likes != null ? String(post.likes) : '',
                            comments: post.comments != null ? String(post.comments) : '',
                          });
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.approveBtnText}>Edit stats</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
        )}
      </ScrollView>

      {/* Stats edit modal */}
      <Modal visible={!!editingPost} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={statsModal.overlay}>
            <View style={statsModal.sheet}>
              <Text style={statsModal.title}>Edit post stats</Text>
              {editingPost && (
                <Text style={statsModal.sub}>
                  {(editingPost as any).redemption?.creator?.profile?.full_name} · {(editingPost as any).redemption?.circuit?.title}
                </Text>
              )}
              {(['views', 'likes', 'comments'] as const).map(field => (
                <View key={field} style={statsModal.fieldRow}>
                  <Text style={statsModal.fieldLabel}>{field.charAt(0).toUpperCase() + field.slice(1)}</Text>
                  <TextInput
                    style={statsModal.input}
                    value={statsDraft[field]}
                    onChangeText={v => setStatsDraft(prev => ({ ...prev, [field]: v }))}
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor={C.muted2}
                  />
                </View>
              ))}
              <TouchableOpacity style={[statsModal.saveBtn, savingStats && { opacity: 0.6 }]} onPress={handleSaveStats} disabled={savingStats}>
                <Text style={statsModal.saveBtnText}>{savingStats ? 'Saving…' : 'Save stats'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={statsModal.cancelBtn} onPress={() => setEditingPost(null)}>
                <Text style={statsModal.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 20, color: C.ink },
  signOut: { fontFamily: F.body, color: C.muted2, fontSize: 13 },
  tabBarScroll: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line, maxHeight: 48, flexGrow: 0 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 4 },
  tab: { paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText: { fontFamily: F.bodySemi, fontSize: 13.5, color: C.muted2 },
  tabTextActive: { fontFamily: F.bodySemi, color: C.accent },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: C.card, borderRadius: R.lg, padding: 18,
    borderWidth: 1, borderColor: C.line, ...(S.card as any),
  },
  cardFlagged: { borderColor: '#FCA5A5', borderWidth: 1.5 },
  name: { fontFamily: F.display, fontWeight: '700', fontSize: 17, color: C.ink, marginBottom: 2 },
  email: { fontFamily: F.mono, fontSize: 12, color: C.accent, letterSpacing: 0.3, marginBottom: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  detail: { fontFamily: F.body, fontSize: 13, color: C.muted },
  bio: { fontFamily: F.body, fontSize: 13, color: C.muted2, fontStyle: 'italic', marginTop: 6, marginBottom: 4 },
  changeRow: { marginBottom: 12 },
  changeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  changeLabel: { fontFamily: F.bodySemi, fontSize: 13, color: C.inkSoft },
  changeValues: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentBadge: { backgroundColor: C.line, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 4 },
  currentBadgeText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.muted },
  pendingBadge: { backgroundColor: C.accentTint, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadgeText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  approveBtn: {
    flex: 1, backgroundColor: C.ok, borderRadius: R.md,
    padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  approveBtnText: { fontFamily: F.bodySemi, color: '#fff', fontSize: 14 },
  rejectBtn: {
    flex: 1, backgroundColor: C.line, borderRadius: R.md,
    padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  rejectBtnText: { fontFamily: F.bodySemi, color: C.muted, fontSize: 14 },
  // Health tab
  healthHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  flagBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DC2626', borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 4,
  },
  flagBadgeText: { fontFamily: F.monoBold, fontSize: 10.5, color: '#fff', letterSpacing: 0.4 },
  healthStats: { flexDirection: 'row', gap: 6 },
  healthStat: { flex: 1, backgroundColor: C.paper, borderRadius: R.sm, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  healthStatNum: { fontFamily: F.display, fontWeight: '700', fontSize: 18, color: C.ink },
  healthStatLabel: { fontFamily: F.mono, fontSize: 9, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },
  statRed: { color: '#DC2626' },
  // Reports tab
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reportType: { fontFamily: F.bodySemi, fontSize: 13, color: '#DC2626' },
  reportDate: { fontFamily: F.mono, fontSize: 11, color: C.muted2 },
  reportDetails: { fontFamily: F.body, fontSize: 13.5, color: C.inkSoft, fontStyle: 'italic', marginTop: 8, lineHeight: 19 },
  empty: { fontFamily: F.body, textAlign: 'center', color: C.muted2, marginTop: 60, fontSize: 15 },
  // Posts tab
  postCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  needsStatsBadge: { backgroundColor: '#FEF3C7', borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#FCD34D' },
  needsStatsBadgeText: { fontFamily: F.bodySemi, fontSize: 11, color: '#92400E' },
  postStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  postStatBox: { flex: 1, backgroundColor: C.paper, borderRadius: R.sm, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  postStatNum: { fontFamily: F.display, fontWeight: '700', fontSize: 15, color: C.accent },
  postStatLabel: { fontFamily: F.mono, fontSize: 9, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
} as any);

const statsModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(36,29,23,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 40 },
  title: { fontFamily: F.displayXBold, fontWeight: '800', fontSize: 20, color: C.ink, marginBottom: 4 },
  sub: { fontFamily: F.body, fontSize: 13, color: C.muted, marginBottom: 20 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  fieldLabel: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink, flex: 1 },
  input: {
    fontFamily: F.body, borderWidth: 1.5, borderColor: C.line2, borderRadius: R.md,
    padding: 11, fontSize: 15, color: C.ink, backgroundColor: C.paper,
    width: 120, textAlign: 'right',
  },
  saveBtn: { backgroundColor: C.accent, borderRadius: R.btn, padding: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontFamily: F.display, fontWeight: '700', fontSize: 16, color: '#fff' },
  cancelBtn: { alignItems: 'center', marginTop: 14 },
  cancelBtnText: { fontFamily: F.body, color: C.muted2, fontSize: 14 },
} as any);
