Set-Location C:\vantro-mobile

# ─── app/(admin)/_layout.tsx ─────────────────────────────────
@'
import { Tabs } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Redirect } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';

const C = { bg: '#0f1923', teal: '#00d4a0', muted: '#4d6478', border: 'rgba(255,255,255,0.07)' };

export default function AdminLayout() {
  const { user, loading } = useAuth();
  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.teal} />
    </View>
  );
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin' && user.role !== 'foreman') return <Redirect href="/(installer)/jobs" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border, borderTopWidth: 1 },
      tabBarActiveTintColor: C.teal,
      tabBarInactiveTintColor: C.muted,
      tabBarLabelStyle: { fontSize: 11, marginBottom: 2 },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Overview', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>⬛</Text> }} />
      <Tabs.Screen name="map" options={{ title: 'Live Map', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📍</Text> }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🏗️</Text> }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>👷</Text> }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🔔</Text> }} />
    </Tabs>
  );
}
'@ | Set-Content "app/(admin)/_layout.tsx" -Encoding UTF8

# ─── app/(admin)/dashboard.tsx ───────────────────────────────
@'
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
'@ | Set-Content "app/(admin)/dashboard.tsx" -Encoding UTF8

# ─── app/(admin)/map.tsx ─────────────────────────────────────
@'
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)' };

export default function MapScreen() {
  const [signins, setSignins] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      const [sRes, jRes] = await Promise.all([
        authFetch('/api/admin/signins'),
        authFetch('/api/admin/jobs'),
      ]);
      const [s, j] = await Promise.all([sRes.json(), jRes.json()]);
      setSignins(s.signins || []);
      setJobs((j.jobs || []).filter((jb: any) => jb.lat && jb.lng));
    } catch {}
    setLoading(false);
  }

  const allCoords = [...signins.filter(s => s.lat && s.lng), ...jobs];
  const region = allCoords.length > 0 ? {
    latitude: allCoords.reduce((s, c) => s + (c.lat || 0), 0) / allCoords.length,
    longitude: allCoords.reduce((s, c) => s + (c.lng || 0), 0) / allCoords.length,
    latitudeDelta: 0.05, longitudeDelta: 0.05,
  } : { latitude: 54.6, longitude: -5.9, latitudeDelta: 0.5, longitudeDelta: 0.5 };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Live Map</Text>
        <View style={s.legend}>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.teal }]} /><Text style={s.legendText}>On site</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#60a5fa' }]} /><Text style={s.legendText}>Job site</Text></View>
        </View>
      </View>
      {loading ? (
        <View style={s.loadingView}><ActivityIndicator color={C.teal} /></View>
      ) : (
        <MapView style={s.map} initialRegion={region} mapType="standard" customMapStyle={darkMapStyle}>
          {jobs.map(job => (
            <React.Fragment key={job.id}>
              <Marker coordinate={{ latitude: job.lat, longitude: job.lng }} title={job.name} description={job.address}>
                <View style={s.jobMarker}><Text style={s.jobMarkerText}>🏗️</Text></View>
              </Marker>
              <Circle center={{ latitude: job.lat, longitude: job.lng }} radius={150} strokeColor="rgba(96,165,250,0.4)" fillColor="rgba(96,165,250,0.06)" />
            </React.Fragment>
          ))}
          {signins.filter(si => si.lat && si.lng).map(si => (
            <Marker key={si.id} coordinate={{ latitude: si.lat, longitude: si.lng }} title={si.users?.name || 'Installer'}>
              <View style={s.installerMarker}><Text style={s.installerMarkerText}>{si.users?.initials || '?'}</Text></View>
            </Marker>
          ))}
        </MapView>
      )}
      <View style={s.footer}>
        <Text style={s.footerText}>{signins.length} on site · {jobs.length} active jobs · updates every 15s</Text>
      </View>
    </SafeAreaView>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1a2635' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4d6478' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1923' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243040' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1923' }] },
];

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  legend: { flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: C.muted },
  loadingView: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1 },
  jobMarker: { backgroundColor: '#1a2635', borderRadius: 20, padding: 6, borderWidth: 2, borderColor: '#60a5fa' },
  jobMarkerText: { fontSize: 16 },
  installerMarker: { backgroundColor: C.teal, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0f1923' },
  installerMarkerText: { fontSize: 12, fontWeight: '700', color: '#0f1923' },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center' },
  footerText: { fontSize: 12, color: C.muted },
});
'@ | Set-Content "app/(admin)/map.tsx" -Encoding UTF8

Write-Host "Part 6 done - admin layout, dashboard, map created" -ForegroundColor Green
