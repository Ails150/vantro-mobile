import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Alert, Linking, AppState,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';
import * as SecureStore from 'expo-secure-store';
import { startBackgroundTracking, stopBackgroundTracking } from '@/lib/locationTracker';
import { isOnline, cacheJobs, getCachedJobs, queueAction, syncQueue } from '@/lib/offline';

const C = {
  bg: '#0f1923', card: '#1a2635', teal: '#00d4a0',
  muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)',
  red: '#f87171', amber: '#fbbf24',
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

export default function JobsScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gpsLoading, setGpsLoading] = useState<string | null>(null);
  const [gpsMsg, setGpsMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const appState = useRef(AppState.currentState);

  const loadJobs = useCallback(async () => {
    const online = await isOnline();
    if (online) {
      // Sync any queued actions first
      const synced = await syncQueue(authFetch);
      try {
        const res = await authFetch('/api/installer/jobs');
        if (res.status === 401) { await logout(); router.replace('/login'); return; }
        const data = await res.json();
        const jobList = data.jobs || [];
        setJobs(jobList);
        await cacheJobs(jobList);
        setOffline(false);
      } catch {
        const cached = await getCachedJobs();
        setJobs(cached);
        setOffline(true);
      }
    } else {
      const cached = await getCachedJobs();
      setJobs(cached);
      setOffline(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadJobs();
    // Sync when app comes to foreground
    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        await loadJobs();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  async function signIn(job: any) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location required', 'Enable location access to sign in to a job.');
      return;
    }
    setGpsLoading(job.id);
    setGpsMsg(null);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, accuracy } = loc.coords;
      const online = await isOnline();
      if (online) {
        const res = await authFetch('/api/signin', {
          method: 'POST',
          body: JSON.stringify({ jobId: job.id, lat: latitude, lng: longitude, accuracy: Math.round(accuracy || 0) }),
        });
        const data = await res.json();
        if (!res.ok) {
          setGpsMsg({ id: job.id, msg: data.error || 'Cannot sign in', ok: false });
        } else {
          setGpsMsg({ id: job.id, msg: 'Signed in - ' + data.distanceMetres + 'm from site', ok: true });
          // Start GPS breadcrumb tracking
          if (data.weeklySchedule) { SecureStore.setItemAsync('vantro_weekly_schedule', JSON.stringify(data.weeklySchedule)).catch(() => {}); }
          startBackgroundTracking().catch(e => console.error('Failed to start tracking:', e));
          loadJobs();
        }
      } else {
        // Queue for later
        await queueAction({ type: 'signin', payload: { jobId: job.id, lat: latitude, lng: longitude, accuracy: Math.round(accuracy || 0) } });
        // Optimistically update local cache
        const updated = jobs.map(j => j.id === job.id ? { ...j, signed_in: true } : j);
        setJobs(updated);
        await cacheJobs(updated);
        setGpsMsg({ id: job.id, msg: 'Offline - sign-in queued, will sync when online', ok: true });
        if (data.weeklySchedule) { SecureStore.setItemAsync('vantro_weekly_schedule', JSON.stringify(data.weeklySchedule)).catch(() => {}); }
          startBackgroundTracking().catch(e => console.error('Failed to start tracking:', e));
      }
    } catch {
      setGpsMsg({ id: job.id, msg: 'Could not get location. Try again.', ok: false });
    }
    setGpsLoading(null);
  }

  async function signOut(job: any) {
    Alert.alert('Sign out', 'Sign out of ' + job.name + '?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Location required', 'Enable location to sign out.'); return; }
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const { latitude, longitude } = loc.coords;
          if (job.lat && job.lng) {
            const dist = haversine(latitude, longitude, job.lat, job.lng);
            if (dist > 150) {
              Alert.alert('Too far', 'You are ' + dist + 'm from site. Must be within 150m to sign out.');
              return;
            }
          }
          const online = await isOnline();
          if (online) {
            await authFetch('/api/signout', { method: 'POST', body: JSON.stringify({ jobId: job.id, lat: latitude, lng: longitude, accuracy: Math.round(loc.coords.accuracy || 0) }) });
            // Stop GPS breadcrumb tracking
            SecureStore.deleteItemAsync('vantro_sign_out_time').catch(() => {});
            stopBackgroundTracking().catch(e => console.error('Failed to stop tracking:', e));
          } else {
            await queueAction({ type: 'signout', payload: { jobId: job.id } });
            const updated = jobs.map(j => j.id === job.id ? { ...j, signed_in: false } : j);
            setJobs(updated);
            await cacheJobs(updated);
          }
          setGpsMsg(null);
          loadJobs();
        },
      },
    ]);
  }

  function openMaps(job: any) {
    if (job.lat && job.lng) {
      Linking.openURL('https://www.google.com/maps/dir/?api=1&destination=' + job.lat + ',' + job.lng).catch(() => Alert.alert('Could not open Maps'));
    } else {
      Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(job.address || '')).catch(() => Alert.alert('Could not open Maps'));
    }
  }

  const signedInJob = jobs.find(j => j.signed_in);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerName}>{user?.name}</Text>
          <Text style={s.headerRole}>Installer</Text>
        </View>
        <TouchableOpacity onPress={() => { logout(); router.replace('/login'); }} style={s.signOutBtn}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {offline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineBannerText}>âš¡ Offline â€” showing cached data. Actions will sync when online.</Text>
        </View>
      )}

      {signedInJob && (
        <View style={s.activeBanner}>
          <View style={s.activeDot} />
          <Text style={s.activeBannerText}>On site - {signedInJob.name}</Text>
        </View>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadJobs(); }} tintColor={C.teal} />}
        contentContainerStyle={s.scroll}
      >
        <Text style={s.sectionLabel}>Your jobs today</Text>

        {!loading && jobs.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No jobs assigned</Text>
            <Text style={s.emptySubText}>Ask your manager to assign you to a job</Text>
          </View>
        )}

        {jobs.map(job => {
          const gps = gpsMsg?.id === job.id ? gpsMsg : null;
          return (
            <View key={job.id} style={[s.card, job.signed_in && s.cardActive]}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.jobName}>{job.name}</Text>
                  <Text style={s.jobAddress}>{job.address}</Text>
                </View>
                {job.signed_in && (
                  <View style={s.onSiteBadge}>
                    <View style={s.onSiteDot} />
                    <Text style={s.onSiteText}>On site</Text>
                  </View>
                )}
              </View>

              {gps && (
                <View style={[s.gpsMsg, gps.ok ? s.gpsMsgOk : s.gpsMsgErr]}>
                  <Text style={[s.gpsMsgText, gps.ok ? s.gpsMsgTextOk : s.gpsMsgTextErr]}>{gps.msg}</Text>
                </View>
              )}

              <TouchableOpacity style={s.directionsBtn} onPress={() => openMaps(job)}>
                <Text style={s.directionsBtnText}>Get directions</Text>
              </TouchableOpacity>

              {!job.signed_in ? (
                <TouchableOpacity
                  style={[s.btn, gpsLoading === job.id && s.btnDisabled]}
                  onPress={() => signIn(job)}
                  disabled={!!gpsLoading || !!signedInJob}
                >
                  <Text style={s.btnText}>
                    {gpsLoading === job.id ? 'Getting location...' : signedInJob ? 'Sign out of current job first' : 'Sign in to job'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={s.signedInActions}>
                  <TouchableOpacity style={s.actionBtn} onPress={() => router.push({ pathname: '/(installer)/diary', params: { id: job.id, name: job.name } })}>
                    <Text style={s.actionBtnText}>Diary</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => router.push({ pathname: '/(installer)/qa', params: { id: job.id, name: job.name } })}>
                    <Text style={s.actionBtnText}>QA</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => router.push({ pathname: '/(installer)/defects', params: { id: job.id, name: job.name } })}>
                    <Text style={s.actionBtnText}>Defects</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#BC6AFF' }]} onPress={() => router.push({ pathname: '/(installer)/capture', params: { id: job.id, name: job.name } })}>
                    <Text style={[s.actionBtnText, { color: '#fff' }]}>Walkthrough</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, s.actionBtnRed]} onPress={() => signOut(job)}>
                    <Text style={[s.actionBtnText, s.actionBtnTextRed]}>Sign out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerName: { fontSize: 15, fontWeight: '600', color: C.text },
  headerRole: { fontSize: 12, color: C.muted },
  signOutBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  signOutText: { fontSize: 13, color: C.muted },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 0, backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  offlineBannerText: { flex: 1, fontSize: 12, color: C.amber },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, backgroundColor: 'rgba(0,212,160,0.08)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal },
  activeBannerText: { flex: 1, fontSize: 13, color: C.teal },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 13, color: C.muted, fontWeight: '500', marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: C.muted, fontSize: 15 },
  emptySubText: { color: C.muted, fontSize: 13, marginTop: 4, opacity: 0.7 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardActive: { borderColor: 'rgba(0,212,160,0.3)' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  jobName: { fontSize: 15, fontWeight: '600', color: C.text },
  jobAddress: { fontSize: 13, color: C.muted, marginTop: 2 },
  onSiteBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,212,160,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  onSiteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.teal },
  onSiteText: { fontSize: 12, color: C.teal, fontWeight: '500' },
  gpsMsg: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  gpsMsgOk: { backgroundColor: 'rgba(0,212,160,0.08)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.2)' },
  gpsMsgErr: { backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)' },
  gpsMsgText: { fontSize: 13 },
  gpsMsgTextOk: { color: C.teal },
  gpsMsgTextErr: { color: C.red },
  btn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#0f1923', fontSize: 15, fontWeight: '700' },
  signedInActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  actionBtnRed: { borderColor: 'rgba(248,113,113,0.3)', backgroundColor: 'rgba(248,113,113,0.06)' },
  actionBtnText: { fontSize: 13, color: C.text, fontWeight: '500' },
  actionBtnTextRed: { color: C.red },
  directionsBtn: { backgroundColor: 'rgba(96,165,250,0.08)', borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(96,165,250,0.2)', marginBottom: 8 },
  directionsBtnText: { fontSize: 13, color: '#60a5fa', fontWeight: '500' },
});

