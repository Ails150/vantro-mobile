Set-Location C:\vantro-mobile

# ─── app/(admin)/jobs.tsx ────────────────────────────────────
@'
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

const statusColor = (s: string) => s === 'active' ? C.teal : s === 'on_hold' ? C.amber : C.muted;

export default function AdminJobsScreen() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState('active');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await authFetch('/api/admin/jobs');
    if (res.ok) { const d = await res.json(); setJobs(d.jobs || []); }
    setRefreshing(false);
  }

  const filters = ['active', 'on_hold', 'completed', 'all'];
  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Jobs</Text></View>
      <View style={s.filterRow}>
        {filters.map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[s.filterBtn, filter === f && s.filterBtnActive]}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f === 'on_hold' ? 'On Hold' : f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.teal} />} contentContainerStyle={s.scroll}>
        {filtered.length === 0 && <Text style={s.empty}>No jobs</Text>}
        {filtered.map(job => (
          <View key={job.id} style={s.card}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.jobName}>{job.name}</Text>
                <Text style={s.jobAddr}>{job.address}</Text>
              </View>
              <Text style={[s.statusBadge, { color: statusColor(job.status) }]}>{job.status}</Text>
            </View>
            {job.checklist_template_id && <Text style={s.checklistTag}>Checklist attached</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.border },
  filterBtnActive: { backgroundColor: C.teal, borderColor: C.teal },
  filterText: { fontSize: 13, color: C.muted },
  filterTextActive: { color: '#0f1923', fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  jobName: { fontSize: 15, fontWeight: '600', color: C.text },
  jobAddr: { fontSize: 13, color: C.muted, marginTop: 2 },
  statusBadge: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  checklistTag: { fontSize: 12, color: C.teal, marginTop: 8 },
});
'@ | Set-Content "app/(admin)/jobs.tsx" -Encoding UTF8

# ─── app/(admin)/team.tsx ────────────────────────────────────
@'
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

const roleColor = (r: string) => r === 'admin' ? '#a78bfa' : r === 'foreman' ? '#60a5fa' : C.muted;

export default function TeamScreen() {
  const [members, setMembers] = useState<any[]>([]);
  const [signins, setSignins] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [mRes, sRes] = await Promise.all([authFetch('/api/admin/team'), authFetch('/api/admin/signins')]);
    if (mRes.ok) { const d = await mRes.json(); setMembers(d.members || []); }
    if (sRes.ok) { const d = await sRes.json(); setSignins(d.signins || []); }
    setRefreshing(false);
  }

  const onSiteIds = new Set(signins.map((s: any) => s.user_id));

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Team</Text><Text style={s.sub}>{members.length} members</Text></View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.teal} />} contentContainerStyle={s.scroll}>
        {members.map(m => {
          const onSite = onSiteIds.has(m.id);
          return (
            <View key={m.id} style={[s.card, m.is_active === false && s.cardInactive]}>
              <View style={s.avatarWrap}>
                <Text style={s.avatarText}>{m.initials}</Text>
                {onSite && <View style={s.onlineDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{m.name}</Text>
                <Text style={s.email}>{m.email || 'No email'}</Text>
                {m.is_active === false && <Text style={s.suspended}>Suspended</Text>}
                {!m.pin_hash && m.role === 'installer' && <Text style={s.noPIN}>PIN not set</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.roleBadge, { color: roleColor(m.role) }]}>{m.role}</Text>
                {onSite && <Text style={s.onSiteText}>On site</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  sub: { fontSize: 13, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardInactive: { opacity: 0.5 },
  avatarWrap: { position: 'relative' },
  avatarText: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', textAlign: 'center', textAlignVertical: 'center', fontSize: 15, fontWeight: '600', color: C.text, lineHeight: 44 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal, borderWidth: 2, borderColor: C.card },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  email: { fontSize: 12, color: C.muted },
  suspended: { fontSize: 11, color: C.amber, marginTop: 2 },
  noPIN: { fontSize: 11, color: C.red, marginTop: 2 },
  roleBadge: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  onSiteText: { fontSize: 11, color: C.teal },
});
'@ | Set-Content "app/(admin)/team.tsx" -Encoding UTF8

# ─── app/(admin)/alerts.tsx ──────────────────────────────────
@'
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, RefreshControl, Alert } from 'react-native';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [pendingQA, setPendingQA] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'alerts'|'qa'>('alerts');

  useEffect(() => { load(); }, []);

  async function load() {
    const [aRes, qRes] = await Promise.all([authFetch('/api/admin/alerts'), authFetch('/api/qa/approvals')]);
    if (aRes.ok) { const d = await aRes.json(); setAlerts(d.alerts || []); }
    if (qRes.ok) { const d = await qRes.json(); setPendingQA(d.pending || []); }
    setRefreshing(false);
  }

  async function dismiss(id: string) {
    await authFetch('/api/admin/alerts', { method: 'POST', body: JSON.stringify({ action: 'dismiss', id }) });
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  async function approveQA(id: string) {
    await authFetch('/api/qa/approvals', { method: 'POST', body: JSON.stringify({ action: 'approve', id }) });
    setPendingQA(prev => prev.filter(q => q.id !== id));
  }

  async function rejectQA(id: string) {
    Alert.prompt('Rejection note', 'Add a note for the installer:', async (note) => {
      await authFetch('/api/qa/approvals', { method: 'POST', body: JSON.stringify({ action: 'reject', id, note }) });
      setPendingQA(prev => prev.filter(q => q.id !== id));
    });
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Alerts & QA</Text></View>
      <View style={s.tabs}>
        <TouchableOpacity onPress={() => setTab('alerts')} style={[s.tab, tab === 'alerts' && s.tabActive]}>
          <Text style={[s.tabText, tab === 'alerts' && s.tabTextActive]}>Alerts {alerts.length > 0 ? `(${alerts.length})` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('qa')} style={[s.tab, tab === 'qa' && s.tabActive]}>
          <Text style={[s.tabText, tab === 'qa' && s.tabTextActive]}>QA Approvals {pendingQA.length > 0 ? `(${pendingQA.length})` : ''}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.teal} />} contentContainerStyle={s.scroll}>
        {tab === 'alerts' && (
          alerts.length === 0
            ? <Text style={s.empty}>No alerts — all clear</Text>
            : alerts.map(a => (
              <View key={a.id} style={[s.alertCard, a.alert_type === 'blocker' && s.alertCardBlocker]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Text style={[s.alertType, a.alert_type === 'blocker' ? s.alertTypeBlocker : s.alertTypeIssue]}>
                    {a.alert_type === 'blocker' ? 'BLOCKER' : 'ISSUE'}
                  </Text>
                  <Text style={s.alertJob}>{a.jobs?.name}</Text>
                </View>
                <Text style={s.alertMsg}>{a.message}</Text>
                <Text style={s.alertTime}>{new Date(a.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                <TouchableOpacity style={s.dismissBtn} onPress={() => dismiss(a.id)}>
                  <Text style={s.dismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ))
        )}
        {tab === 'qa' && (
          pendingQA.length === 0
            ? <Text style={s.empty}>No QA submissions awaiting approval</Text>
            : pendingQA.map(qa => (
              <View key={qa.id} style={s.qaCard}>
                <Text style={s.qaJob}>{qa.jobs?.name}</Text>
                <Text style={s.qaUser}>{qa.users?.name}</Text>
                <Text style={s.qaTime}>Submitted {new Date(qa.submitted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                <View style={s.qaActions}>
                  <TouchableOpacity style={s.approveBtn} onPress={() => approveQA(qa.id)}>
                    <Text style={s.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => rejectQA(qa.id)}>
                    <Text style={s.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.teal },
  tabText: { fontSize: 13, color: C.muted, fontWeight: '500' },
  tabTextActive: { color: C.teal },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 48 },
  alertCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 6 },
  alertCardBlocker: { borderLeftWidth: 3, borderLeftColor: C.red },
  alertType: { fontSize: 11, fontWeight: '700', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  alertTypeBlocker: { backgroundColor: 'rgba(248,113,113,0.15)', color: C.red },
  alertTypeIssue: { backgroundColor: 'rgba(251,191,36,0.15)', color: C.amber },
  alertJob: { fontSize: 12, color: C.muted, flex: 1 },
  alertMsg: { fontSize: 14, color: C.text },
  alertTime: { fontSize: 11, color: C.muted },
  dismissBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  dismissText: { fontSize: 13, color: C.muted },
  qaCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 4 },
  qaJob: { fontSize: 15, fontWeight: '600', color: C.text },
  qaUser: { fontSize: 13, color: C.muted },
  qaTime: { fontSize: 12, color: C.muted },
  qaActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: C.teal, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtnText: { fontSize: 14, fontWeight: '600', color: '#0f1923' },
  rejectBtn: { flex: 1, backgroundColor: 'rgba(248,113,113,0.1)', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)' },
  rejectBtnText: { fontSize: 14, fontWeight: '600', color: C.red },
});
'@ | Set-Content "app/(admin)/alerts.tsx" -Encoding UTF8

Write-Host "Part 7 done - admin jobs, team, alerts screens created" -ForegroundColor Green
