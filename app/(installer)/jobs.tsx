import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Animated,
  StyleSheet, RefreshControl, Alert, Linking, AppState,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logCurrentLocation, evaluateTrackingState } from '@/lib/locationTracker';
import { setActiveShift, hydrateActiveShift } from '@/lib/activeShift';
import { isOnline, cacheJobs, getCachedJobs, queueAction, syncQueue } from '@/lib/offline';
import { distanceToJob, geofenceRadius } from '@/lib/geo';
import { colors, radius, space, type } from '@/theme';
import ScreenHeader from '@/components/ScreenHeader';

const C = {
  bg: '#0f1923', card: '#1a2635', teal: '#00d4a0',
  muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)',
  red: '#f87171', amber: '#fbbf24',
};

// A card carries exactly one primary action, chosen by the state of the job.
type CardState = 'complete' | 'signedIn' | 'inRange' | 'outOfRange';

function cardState(job: any, distance: number | null): CardState {
  if (job.status === 'complete' || job.status === 'completed') return 'complete';
  if (job.signed_in) return 'signedIn';
  if (distance != null && distance > geofenceRadius(job)) return 'outOfRange';
  return 'inRange';
}

// jobs.start_time / jobs.sign_out_time are SQL time columns ("08:00:00").
function hhmm(t?: string | null): string | null {
  return t ? String(t).slice(0, 5) : null;
}

function scheduledWindow(job: any): string | null {
  const from = hhmm(job.start_time);
  const to = hhmm(job.sign_out_time);
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return null;
}

// The signed in dot pulses so the card the installer is standing on reads as live.
function PulsingDot() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[s.dot, s.dotTeal, {
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
      }]}
    />
  );
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
  const [bgGpsEnabled, setBgGpsEnabled] = useState(true);
  const [gpsLevel, setGpsLevel] = useState<'always' | 'whenInUse' | 'denied' | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Check stored GPS permission level on mount + every focus
  useEffect(() => {
    let mounted = true;
    async function checkLevel() {
      try {
        const stored = await AsyncStorage.getItem('gps_permission_level');
        if (mounted && (stored === 'always' || stored === 'whenInUse' || stored === 'denied')) {
          setGpsLevel(stored);
        }
      } catch {}
    }
    checkLevel();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') checkLevel();
    });
    return () => { mounted = false; sub.remove(); };
  }, []);
  // Each card needs to know whether the installer is in range before they press
  // anything, so poll a coarse fix rather than waiting for a sign in attempt.
  useEffect(() => {
    let alive = true;
    async function fix() {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (alive) setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {}
    }
    fix();
    const t = setInterval(fix, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

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
        if (data.company_settings?.background_gps_enabled != null) {
          setBgGpsEnabled(data.company_settings.background_gps_enabled);
        }
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
    // Hydrate active shift from server (only when online) and evaluate tracking window
    try {
      const onlineNow = await isOnline();
      if (onlineNow) { await hydrateActiveShift(); }
      evaluateTrackingState().catch(() => {});
    } catch {}
    // Foreground heartbeat: if signed in, log a breadcrumb so the map has data even if the background task is throttled
    try {
      const currentJobs = await getCachedJobs();
      if (currentJobs?.some((j: any) => j.signed_in)) {
        logCurrentLocation('foreground').catch(() => {});
      }
    } catch {}
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

  // The job hub is the installer's home while on site: everything they can do
  // on this job hangs off it, so sign in lands there rather than back on the list.
  function openJobHub(job: any) {
    router.push({ pathname: '/(installer)/job/[id]' as any, params: { id: job.id, name: job.name } });
  }

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
          if (data.activeShift) { await setActiveShift(data.activeShift); }
          evaluateTrackingState().catch(e => console.error('Failed to evaluate tracking:', e));
          logCurrentLocation('signin', true).catch(() => {});
          loadJobs();
          openJobHub(job);
        }
      } else {
        // Queue for later
        await queueAction({ type: 'signin', payload: { jobId: job.id, lat: latitude, lng: longitude, accuracy: Math.round(accuracy || 0) } });
        // Optimistically update local cache
        const updated = jobs.map(j => j.id === job.id ? { ...j, signed_in: true } : j);
        setJobs(updated);
        await cacheJobs(updated);
        setGpsMsg({ id: job.id, msg: 'Offline - sign-in queued, will sync when online', ok: true });
        // No activeShift available offline - tracking will engage when queue syncs
      }
    } catch {
      setGpsMsg({ id: job.id, msg: 'Could not get location. Try again.', ok: false });
    }
    setGpsLoading(null);
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
    <View style={s.safe}>
      <ScreenHeader
        title="Jobs"
        right={
          <TouchableOpacity onPress={() => { logout(); router.replace('/login'); }} style={s.signOutBtn}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        }
      />
      {/* The installer's name lives here only. It used to print in the header too. */}
      <View style={s.header}>
        <View>
          <Text style={s.headerName}>{user?.name}</Text>
          <Text style={s.headerRole}>Installer</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(installer)/expenses')} style={s.snapBtn}>
          <Ionicons name="camera" size={16} color={colors.base} />
          <Text style={s.snapBtnText}>Snap expense</Text>
        </TouchableOpacity>
      </View>

      {gpsLevel && gpsLevel !== 'always' && (
        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          style={{ backgroundColor: '#fbbf24', padding: 12, marginHorizontal: 16, marginTop: 8, borderRadius: 8 }}
          accessibilityLabel="gps-limited-banner"
        >
          <Text style={{ color: '#0f1923', fontWeight: '700', fontSize: 13 }}>
            Limited GPS, breadcrumb trail not recording
          </Text>
          <Text style={{ color: '#0f1923', fontSize: 12, marginTop: 2, opacity: 0.8 }}>
            Tap to open Settings → Location → Always Allow
          </Text>
        </TouchableOpacity>
      )}
      {offline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineBannerText}>- Offline - showing cached data. Actions will sync when online.</Text>
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
          const distance = distanceToJob(coords, job);
          const state = cardState(job, distance);
          const window = scheduledWindow(job);
          const busyElsewhere = !!signedInJob && !job.signed_in;

          // Directions is the primary only while the installer still has to
          // travel. In range it demotes to a text link under the primary.
          const primary =
            state === 'complete' ? { label: 'View summary', onPress: () => openJobHub(job) }
            : state === 'signedIn' ? { label: 'Open job', onPress: () => openJobHub(job) }
            : state === 'outOfRange' ? { label: 'Get directions', onPress: () => openMaps(job) }
            : {
                label: gpsLoading === job.id ? 'Getting location...'
                  : busyElsewhere ? 'Sign out of current job first'
                  : 'Sign in to job',
                onPress: () => signIn(job),
                disabled: !!gpsLoading || busyElsewhere,
              };

          return (
            <View key={job.id} style={[s.card, job.signed_in && s.cardActive]}>
              <View style={s.cardHeader}>
                {state === 'signedIn'
                  ? <PulsingDot />
                  : <View style={[s.dot, state === 'inRange' ? s.dotTeal : state === 'complete' ? s.dotMuted : s.dotGrey]} />}
                <View style={{ flex: 1 }}>
                  <Text style={s.jobName}>{job.name}</Text>
                  <Text style={s.jobAddress}>{job.address}</Text>
                  {window ? <Text style={s.jobWindow}>{window}</Text> : null}
                </View>
              </View>

              {gps && (
                <View style={[s.gpsMsg, gps.ok ? s.gpsMsgOk : s.gpsMsgErr]}>
                  <Text style={[s.gpsMsgText, gps.ok ? s.gpsMsgTextOk : s.gpsMsgTextErr]}>{gps.msg}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.btn, primary.disabled && s.btnDisabled]}
                onPress={primary.onPress}
                disabled={primary.disabled}
              >
                <Text style={s.btnText}>{primary.label}</Text>
              </TouchableOpacity>

              {state !== 'outOfRange' && (
                <Pressable onPress={() => openMaps(job)} hitSlop={8} style={s.directionsLink}>
                  <Text style={s.directionsLinkText}>Get directions</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerName: { fontSize: 15, fontWeight: '600', color: C.text },
  headerRole: { fontSize: 12, color: C.muted },
  snapBtn: {
    backgroundColor: colors.teal, paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm,
  },
  snapBtnText: { color: colors.base, fontWeight: '700', fontSize: 14 },
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
  dot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 5 },
  dotTeal: { backgroundColor: colors.teal },
  dotGrey: { backgroundColor: colors.textMuted },
  dotMuted: { backgroundColor: colors.surface3 },
  jobWindow: { ...type.caption, marginTop: space.xs },
  jobName: { fontSize: 15, fontWeight: '600', color: C.text },
  jobAddress: { fontSize: 13, color: C.muted, marginTop: 2 },
  gpsMsg: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  gpsMsgOk: { backgroundColor: 'rgba(0,212,160,0.08)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.2)' },
  gpsMsgErr: { backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)' },
  gpsMsgText: { fontSize: 13 },
  gpsMsgTextOk: { color: C.teal },
  gpsMsgTextErr: { color: C.red },
  btn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#0f1923', fontSize: 15, fontWeight: '700' },
  directionsLink: { alignSelf: 'center', paddingVertical: space.md },
  directionsLinkText: { ...type.sub, color: colors.blue },
});

