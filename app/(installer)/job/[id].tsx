import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import ScreenHeader from '@/components/ScreenHeader';
import { authFetch } from '@/lib/api';
import { getCachedJobs, cacheJobs, isOnline, queueAction } from '@/lib/offline';
import { getActiveShift, clearActiveShift, hydrateActiveShift } from '@/lib/activeShift';
import { stopBackgroundTracking } from '@/lib/locationTracker';
import { recordSuccessfulSignOut } from '@/lib/rating';
import { distanceToJob, geofenceRadius } from '@/lib/geo';
import { clockTime } from '@/lib/clock';
import { colors, formatDistance, radius, space, type } from '@/theme';

type Badge = { text: string; tone: 'teal' | 'amber' | 'muted' } | null;

type Action = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  pathname: string;
  badge: Badge;
};

// An await with no deadline is indistinguishable from a dead button.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function JobHubScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signedInAt, setSignedInAt] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [diaryToday, setDiaryToday] = useState<number | null>(null);
  const [qaProgress, setQaProgress] = useState<{ done: number; total: number } | null>(null);
  const [openDefects, setOpenDefects] = useState<number | null>(null);
  const [unsignedTalks, setUnsignedTalks] = useState(0);
  const [ramsBlocked, setRamsBlocked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);

  const loadJob = useCallback(async () => {
    const cached = await getCachedJobs();
    const fromCache = (cached || []).find((j: any) => j.id === id);
    if (fromCache) setJob(fromCache);
    if (await isOnline()) {
      try {
        const res = await authFetch('/api/installer/jobs');
        if (res.ok) {
          const data = await res.json();
          const list = data.jobs || [];
          await cacheJobs(list);
          const fresh = list.find((j: any) => j.id === id);
          if (fresh) setJob(fresh);
        }
      } catch {}
      try { await hydrateActiveShift(); } catch {}
    }
    const shift = await getActiveShift();
    setSignedInAt(shift && shift.jobId === id ? shift.signedInAt : null);
    setLoading(false);
  }, [id]);

  // Badge counts. Each is independent, so a failing endpoint hides one badge
  // rather than emptying the whole row.
  const loadBadges = useCallback(async () => {
    if (!(await isOnline())) return;
    const since = startOfToday().toISOString();
    authFetch(`/api/diary?jobId=${id}&limit=200&since=${encodeURIComponent(since)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDiaryToday((d.entries || []).length); })
      .catch(() => {});

    authFetch(`/api/qa?jobId=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        let done = 0, total = 0;
        for (const cl of d.checklists || []) {
          const subs = cl.submissions || [];
          for (const item of cl.items || []) {
            total += 1;
            const state = subs.find((sm: any) => sm.checklist_item_id === item.id)?.state;
            if (state && state !== 'pending') done += 1;
          }
        }
        setQaProgress({ done, total });
      })
      .catch(() => {});

    authFetch(`/api/defects?jobId=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setOpenDefects((d.defects || []).filter((x: any) => x.status !== 'resolved').length);
      })
      .catch(() => {});

    // Unsigned toolbox talks. The badge is the whole reason a worker opens the
    // screen -- without it a briefing waiting for a signature is invisible
    // until someone chases it.
    authFetch(`/api/installer/toolbox-talks?jobId=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setUnsignedTalks((d.talks || []).filter((t: any) => !t.signedAt).length);
      })
      .catch(() => {});

    // Whether the RAMS is blocking sign-in. Shown on the action rather than
    // discovered at the sign-in button, so the worker finds out before they
    // are standing on site trying to start.
    authFetch(`/api/installer/rams?jobId=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setRamsBlocked(!!d.blocked); })
      .catch(() => {});
  }, [id]);

  useEffect(() => { loadJob(); loadBadges(); }, [loadJob, loadBadges]);

  // Refresh when the installer comes back from diary, QA or defects.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        loadJob();
        loadBadges();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadJob, loadBadges]);

  // One fix when the screen opens, so the sign out button can say whether it
  // will work before it is pressed.
  //
  // This was a fix every 30 seconds for as long as the job screen was open --
  // which, for someone on site, is most of the working day. Sign out takes its
  // own fresh fix at the moment it is pressed, so the poll bought nothing but
  // a label that was a few seconds newer, at the cost of the battery.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (alive) setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const distance = distanceToJob(coords, job);
  const fence = geofenceRadius(job);
  // Unknown distance is not treated as out of range: the server re-checks.
  const outOfRange = distance != null && distance > fence;
  const blocked = outOfRange || signingOut;

  // One line per state change, so a single run says which gate is closed.
  useEffect(() => {
    console.log('[HUB-SIGNOUT] gate',
      'jobId=', id,
      'jobLoaded=', !!job,
      'jobLat=', job?.lat, 'jobLng=', job?.lng,
      'coords=', coords ? `${coords.latitude},${coords.longitude}` : null,
      'distance=', distance,
      'fence=', fence,
      'outOfRange=', outOfRange,
      'signingOut=', signingOut,
      'buttonDisabled=', blocked,
      'signedInAt=', signedInAt);
  }, [id, job, coords, distance, fence, outOfRange, signingOut, blocked, signedInAt]);

  async function signOutOfJob() {
    console.log('[HUB-SIGNOUT] pressed');
    setSigningOut(true);
    setSignOutError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      console.log('[HUB-SIGNOUT] permission=', perm.status);
      if (perm.status !== 'granted') {
        setSignOutError('Location access is off. Enable it to sign out.');
        return;
      }

      // A High accuracy fix can block indefinitely indoors. Without a deadline
      // the button just sits on "Signing out..." forever, which reads as dead.
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        15000,
        'location',
      );
      const { latitude, longitude, accuracy } = loc.coords;
      const dist = distanceToJob({ latitude, longitude }, job);
      console.log('[HUB-SIGNOUT] fix', latitude, longitude, 'dist=', dist, 'fence=', fence);
      setCoords({ latitude, longitude });

      if (dist != null && dist > fence) {
        setSignOutError(`You are ${formatDistance(dist)} away. Sign out opens within ${fence} m of the address.`);
        return;
      }

      // Always sent, so the shift row records the quality of the fix that
      // closed it as well as the one that opened it.
      const payload = { jobId: id, lat: latitude, lng: longitude, accuracy: accuracy != null ? Math.round(accuracy) : null };
      console.log('[HUB-SIGNOUT] payload', JSON.stringify(payload));

      // NetInfo reports isInternetReachable as null for a while after launch,
      // which isOnline() reads as offline. Try the call and fall back to the
      // queue on failure, rather than queueing a shift that could have synced.
      let posted = false;
      try {
        const res = await withTimeout(
          authFetch('/api/signout', { method: 'POST', body: JSON.stringify(payload) }),
          20000,
          'signout request',
        );
        const body = await res.json().catch(() => ({}));
        console.log('[HUB-SIGNOUT] response', res.status, JSON.stringify(body));
        if (!res.ok) {
          // A refusal is the server's to explain. Never swallow it.
          setSignOutError(body?.error || `Sign out failed (${res.status}).`);
          return;
        }
        posted = true;
      } catch (e: any) {
        console.log('[HUB-SIGNOUT] request failed', e?.message);
      }

      if (posted) {
        await clearActiveShift();
        stopBackgroundTracking().catch(() => {});
        // Only a sign out the server took counts towards the rating prompt.
        await recordSuccessfulSignOut();
      } else {
        await queueAction({ type: 'signout', payload: { jobId: id } });
        await clearActiveShift();
      }
      console.log('[HUB-SIGNOUT] done, posted=', posted);
      router.replace('/(installer)/home');
    } catch (e: any) {
      console.log('[HUB-SIGNOUT] threw', e?.message);
      setSignOutError(
        e?.message === 'location'
          ? 'Could not get a location fix. Move outside and try again.'
          : 'Could not sign out. Try again.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  const jobName = job?.name || name || 'Job';

  // Back goes Home, not to the jobs list. Whoever leaves this screen is either
  // still on the shift -- in which case Home carries it with a Resume button --
  // or has just signed out, and neither wants a list of jobs to search through.
  function goHome() {
    router.replace('/(installer)/home');
  }

  const actions: Action[] = [
    {
      key: 'diary', label: 'Site diary', icon: 'document-text-outline', pathname: '/(installer)/diary',
      badge: diaryToday ? { text: diaryToday === 1 ? '1 entry today' : `${diaryToday} entries today`, tone: 'muted' } : null,
    },
    {
      key: 'qa', label: 'QA checklist', icon: 'checkmark-circle-outline', pathname: '/(installer)/qa',
      badge: qaProgress && qaProgress.total > 0
        ? { text: `${qaProgress.done} of ${qaProgress.total} done`, tone: qaProgress.done === qaProgress.total ? 'teal' : 'muted' }
        : null,
    },
    {
      key: 'defects', label: 'Log a defect', icon: 'warning-outline', pathname: '/(installer)/defects',
      badge: openDefects ? { text: openDefects === 1 ? '1 open' : `${openDefects} open`, tone: 'amber' } : null,
    },
    {
      key: 'rams', label: 'RAMS', icon: 'document-lock-outline', pathname: '/(installer)/rams',
      badge: ramsBlocked ? { text: 'Sign to start', tone: 'amber' } : null,
    },
    {
      key: 'toolbox', label: 'Toolbox talks', icon: 'shield-checkmark-outline', pathname: '/(installer)/toolbox-talks',
      badge: unsignedTalks ? { text: unsignedTalks === 1 ? '1 to sign' : `${unsignedTalks} to sign`, tone: 'amber' } : null,
    },
    { key: 'expenses', label: 'Snap expense', icon: 'receipt-outline', pathname: '/(installer)/expenses', badge: null },
    { key: 'capture', label: 'Walk and Talk', icon: 'mic-outline', pathname: '/(installer)/capture', badge: null },
  ];

  if (loading) {
    return (
      <View style={s.safe}>
        <ScreenHeader title={jobName} onBack={goHome} />
        <View style={s.loading}><ActivityIndicator color={colors.teal} /></View>
      </View>
    );
  }

  return (
    <View style={s.safe}>
      <ScreenHeader title={jobName} subtitle={job?.address} onBack={goHome} />

      <ScrollView contentContainerStyle={s.scroll}>
        {/* The shift shows the time it started and nothing else. A ticking
            counter turns a shift into a stopwatch the worker feels watched by,
            and it re-rendered this screen once a second to say so. */}
        {signedInAt ? (
          <View style={s.shiftRow}>
            <View style={s.chip}>
              <View style={s.chipDot} />
              <Text style={s.chipTxt}>Signed in at {clockTime(signedInAt)}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.list}>
          {actions.map((a, i) => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => router.push({ pathname: a.pathname as any, params: { id, name: jobName } })}
              style={({ pressed }) => [s.row, i > 0 && s.rowDivider, pressed && s.rowPressed]}
            >
              <Ionicons name={a.icon} size={22} color={colors.teal} style={s.rowIcon} />
              <Text style={s.rowLabel}>{a.label}</Text>
              {a.badge ? (
                <Text
                  style={[
                    s.badge,
                    a.badge.tone === 'teal' && s.badgeTeal,
                    a.badge.tone === 'amber' && s.badgeAmber,
                  ]}
                >
                  {a.badge.text}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable
          onPress={blocked ? undefined : signOutOfJob}
          disabled={blocked}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          accessibilityHint={outOfRange && distance != null
            ? `You are ${formatDistance(distance)} from the address`
            : undefined}
          style={[s.signOut, blocked && s.signOutOff]}
        >
          <Text style={[s.signOutTxt, blocked && s.signOutTxtOff]}>
            {outOfRange ? 'Move closer to sign out' : signingOut ? 'Signing out...' : 'Sign out of job'}
          </Text>
        </Pressable>

        {/* A disabled sign out always says why, and a refusal always shows the
            reason the server or the device gave. */}
        {outOfRange && distance != null ? (
          <Text style={s.footerNote}>
            You are {formatDistance(distance)} away. Sign out opens within {fence} m of the address.
          </Text>
        ) : signOutError ? (
          <Text style={[s.footerNote, s.footerErr]}>{signOutError}</Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: space.lg, paddingBottom: space.xxl },
  shiftRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  chipDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.teal },
  chipTxt: { ...type.sub, color: colors.teal, fontVariant: ['tabular-nums'] },
  list: { backgroundColor: colors.surface1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 18 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surface2 },
  rowIcon: { width: 24, textAlign: 'center' },
  rowLabel: { ...type.body, flex: 1 },
  badge: { ...type.caption, color: colors.textSecondary },
  badgeTeal: { color: colors.teal },
  badgeAmber: { color: colors.amber },
  footer: {
    paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm,
    backgroundColor: colors.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  // Solid and neutral, not a red outline. Finishing a shift is the normal end
  // of the day: red is the colour this app uses for a defect or a refusal, and
  // spending it on the expected action teaches people to ignore it.
  signOut: {
    backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.surface3,
    borderRadius: radius.md, paddingVertical: 16, alignItems: 'center',
  },
  signOutOff: { borderColor: colors.surface2, backgroundColor: colors.surface2 },
  signOutTxt: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  signOutTxtOff: { color: colors.textMuted },
  footerNote: { ...type.caption, textAlign: 'center' },
  footerErr: { color: colors.red },
});
