import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [jobsRes, signinsRes, alertsRes, qaRes] = await Promise.all([
        authFetch('/api/admin/jobs'),
        authFetch('/api/admin/signins'),
        authFetch('/api/admin/alerts'),
        authFetch('/api/qa/approvals'),
      ]);
      const [jobs, signins, alerts, qa] = await Promise.all([
        jobsRes.ok ? jobsRes.json() : { jobs: [] },
        signinsRes.ok ? signinsRes.json() : { signins: [] },
        alertsRes.ok ? alertsRes.json() : { alerts: [] },
        qaRes.ok ? qaRes.json() : { pending: [] },
      ]);
      setData({ jobs: jobs.jobs || [], signins: signins.signins || [], alerts: alerts.alerts || [], pendingQA: qa.pending || [] });
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const kpis = data ? [
    { label: 'On Site Now', value: data.signins.length, color: C.teal },
    { label: 'Active Jobs', value: data.jobs.filter((j: any) => j.status === 'active').length, color: C.text },
    { label: 'Awaiting QA', value: data.pendingQA.length, color: C.amber },
    { label: 'Unread Alerts', value: data.alerts.length, color: C.red },
  ] : [];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Van<Text style={{ color: C.teal }}>tro</Text></Text>
          <Text style={s.headerSub}>Admin Dashboard</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {data && <View style={s.onSitePill}><View style={s.onSiteDot} /><Text style={s.onSiteText}>{data.signins.length} on site</Text></View>}
          <TouchableOpacity onPress={() => { logout(); router.replace('/login'); }} style={s.signOutBtn}>
            <Text style={s.signOutText}>Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.teal} />} contentContainerStyle={s.scroll}>
        <View style={s.kpiGrid}>
          {kpis.map(k => (
            <View key={k.label} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={[s.kpiValue, { color: k.color }]}>{k.value}</Text>
            </View>
          ))}
        </View>

        {data?.signins.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Live on site</Text>
            {data.signins.map((si: any) => (
              <View key={si.id} style={s.row}>
                <View style={s.avatar}><Text style={s.avatarText}>{si.users?.initials || '?'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{si.users?.name}</Text>
                  <Text style={s.rowSub}>In at {new Date(si.signed_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <View style={s.onlineDot} />
              </View>
            ))}
          </View>
        )}

        {data?.alerts.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Recent alerts</Text>
            {data.alerts.slice(0, 5).map((a: any) => (
              <View key={a.id} style={[s.alertRow, a.alert_type === 'blocker' && s.alertRowBlocker]}>
                <Text style={s.alertJob}>{a.jobs?.name}</Text>
                <Text style={s.alertMsg}>{a.message}</Text>
              </View>
            ))}
          </View>
        )}

        {data?.pendingQA.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Awaiting QA approval</Text>
            {data.pendingQA.slice(0, 5).map((qa: any) => (
              <View key={qa.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{qa.jobs?.name}</Text>
                  <Text style={s.rowSub}>{qa.users?.name}</Text>
                </View>
                <Text style={s.pendingBadge}>Pending</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  headerSub: { fontSize: 12, color: C.muted },
  onSitePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,212,160,0.08)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.2)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  onSiteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.teal },
  onSiteText: { fontSize: 12, color: C.teal, fontWeight: '500' },
  signOutBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  signOutText: { fontSize: 13, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: { width: '47.5%', backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  kpiLabel: { fontSize: 12, color: C.muted, marginBottom: 6 },
  kpiValue: { fontSize: 36, fontWeight: '700' },
  section: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 14, overflow: 'hidden' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: C.text, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '600', color: C.text },
  rowName: { fontSize: 14, fontWeight: '500', color: C.text },
  rowSub: { fontSize: 12, color: C.muted },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal },
  alertRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  alertRowBlocker: { borderLeftWidth: 3, borderLeftColor: C.red },
  alertJob: { fontSize: 11, color: C.muted, marginBottom: 2 },
  alertMsg: { fontSize: 13, color: C.text },
  pendingBadge: { fontSize: 12, color: C.amber, backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
});
