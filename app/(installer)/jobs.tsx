import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';

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

  const loadJobs = useCallback(async () => {
    try {
      const res = await authFetch('/api/installer/jobs');
      if (res.status === 401) { await logout(); router.replace('/login'); return; }
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadJobs(); }, []);

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
      const res = await authFetch('/api/signin', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, lat: latitude, lng: longitude, accuracy: Math.round(accuracy || 0) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGpsMsg({ id: job.id, msg: data.error || 'Cannot sign in', ok: false });
      } else {
        setGpsMsg({ id: job.id, msg: `Signed in - ${data.distanceMetres}m from site`, ok: true });
        loadJobs();
      }
    } catch {
      setGpsMsg({ id: job.id, msg: 'Could not get location. Try again.', ok: false });
    }
    setGpsLoading(null);
  }

  async function signOut(job: any) {
    Alert.alert('Sign out', `Sign out of ${job.name}?`, [
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
              Alert.alert('Too far', `You are ${dist}m from site. Must be within 150m to sign out.`);
              return;
            }
          }
          await authFetch('/api/signout', { method: 'POST', body: JSON.stringify({ jobId: job.id }) });
          setGpsMsg(null);
          loadJobs();
        },
      },
    ]);
  }

  function openMaps(job: any) {
    const address = encodeURIComponent(job.address || '');
    const latLng = job.lat && job.lng ? ${job.lat}, : null;
    const url = latLng
      ? https://www.google.com/maps/dir/?api=1&destination=
      : https://www.google.com/maps/search/?api=1&query=;
    Linking.openURL(url).catch(() => {
      Linking.openURL(maps:?q=).catch(() => Alert.alert('Maps not available'));
    });
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