import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, Alert, AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useT } from '@/context/LanguageContext';
import { getActiveShift, hydrateActiveShift, type ActiveShift } from '@/lib/activeShift';
import { getCachedJobs } from '@/lib/offline';
import { clockTime } from '@/lib/clock';
import { shouldPromptForRating, markRatingAsked, requestReview } from '@/lib/rating';
import ScreenHeader from '@/components/ScreenHeader';
import { alpha, colors, radius, space, type } from '@/theme';

/**
 * Home.
 *
 * Exists for one reason: a worker who is signed in must never have to go
 * looking for the job they are standing on. The open shift is the first thing
 * on the screen, with one button that puts them back in it, and every route out
 * of the job screen -- the back arrow, signing out -- lands here rather than on
 * a list of jobs they then have to read.
 *
 * Everything else on this screen is deliberately thin. It is a place to land,
 * not a dashboard.
 */

type Shortcut = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  pathname: string;
};

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useT();

  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [jobAddress, setJobAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const appState = useRef(AppState.currentState);

  const load = useCallback(async () => {
    // Cached first so the card is on screen before the network answers -- this
    // is the screen someone opens one-handed on a ladder.
    const cached = await getActiveShift();
    setShift(cached);
    try {
      const fresh = await hydrateActiveShift();
      setShift(fresh);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') load();
      appState.current = next;
    });
    return () => sub.remove();
  }, [load]);

  // The address is not on the shift record, so it comes off the cached job
  // list. Missing is fine: the card is about which job, not where.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!shift) { setJobAddress(null); return; }
      const jobs = await getCachedJobs();
      const job = (jobs || []).find((j: any) => j.id === shift.jobId);
      if (alive) setJobAddress(job?.address || null);
    })();
    return () => { alive = false; };
  }, [shift]);

  // Sign out lands here now, so this is where the review prompt belongs. It
  // used to live on the Jobs screen for exactly that reason.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await shouldPromptForRating()) || cancelled) return;
      // Written before the prompt, not after: the OS dialog reports nothing
      // back, so recording on success would ask again on every dismissal.
      await markRatingAsked();
      Alert.alert(
        t('rating.title'),
        t('rating.body'),
        [
          { text: t('rating.later'), style: 'cancel' },
          { text: t('rating.rate'), onPress: () => { requestReview(); } },
        ],
        { cancelable: true },
      );
    })();
    return () => { cancelled = true; };
  }, []);

  const shortcuts: Shortcut[] = [
    { key: 'jobs', label: t('jobs.title'), icon: 'briefcase-outline', pathname: '/(installer)/jobs' },
    { key: 'schedule', label: t('home.schedule'), icon: 'calendar-outline', pathname: '/(installer)/schedule' },
    { key: 'hours', label: t('home.hours'), icon: 'time-outline', pathname: '/(installer)/my-hours' },
  ];

  function resume() {
    if (!shift) return;
    router.push({
      pathname: '/(installer)/job/[id]' as any,
      params: { id: shift.jobId, name: shift.jobName || '' },
    });
  }

  return (
    <View style={s.safe}>
      <ScreenHeader
        title={t('home.title')}
        right={
          <>
            <Pressable
              onPress={() => router.push('/(installer)/scan')}
              style={s.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={t('qr.scanTitle')}
            >
              <Ionicons name="scan-outline" size={19} color={colors.teal} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/(installer)/my-qr')}
              style={s.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={t('qr.myTitle')}
            >
              <Ionicons name="qr-code-outline" size={19} color={colors.teal} />
            </Pressable>
          </>
        }
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.teal}
          />
        }
      >
        <View style={s.who}>
          <Text style={s.whoName}>{user?.name}</Text>
          <Text style={s.whoRole}>{t('jobs.role')}</Text>
        </View>

        {shift ? (
          <View style={s.activeCard}>
            <View style={s.activeTop}>
              <View style={s.dot} />
              <Text style={s.activeLabel}>{t('home.onSite')}</Text>
            </View>

            <Text style={s.activeJob} numberOfLines={2}>
              {shift.jobName || t('home.untitledJob')}
            </Text>
            {jobAddress ? (
              <Text style={s.activeAddress} numberOfLines={1}>{jobAddress}</Text>
            ) : null}
            <Text style={s.activeSince}>
              {t('home.signedInAt', { time: clockTime(shift.signedInAt) })}
            </Text>

            <Pressable
              onPress={resume}
              accessibilityRole="button"
              accessibilityLabel={t('home.resume')}
              style={({ pressed }) => [s.resume, pressed && s.resumePressed]}
            >
              <Text style={s.resumeTxt}>{t('home.resume')}</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.base} />
            </Pressable>
          </View>
        ) : (
          <View style={s.idleCard}>
            <Text style={s.idleTitle}>
              {loading ? t('common.loading') : t('home.notSignedIn')}
            </Text>
            <Text style={s.idleBody}>{t('home.notSignedInBody')}</Text>
            <Pressable
              onPress={() => router.push('/(installer)/jobs')}
              accessibilityRole="button"
              style={({ pressed }) => [s.idleBtn, pressed && s.rowPressed]}
            >
              <Text style={s.idleBtnTxt}>{t('home.findJob')}</Text>
            </Pressable>
          </View>
        )}

        <View style={s.list}>
          {shortcuts.map((sc, i) => (
            <Pressable
              key={sc.key}
              accessibilityRole="button"
              accessibilityLabel={sc.label}
              onPress={() => router.push(sc.pathname as any)}
              style={({ pressed }) => [s.row, i > 0 && s.rowDivider, pressed && s.rowPressed]}
            >
              <Ionicons name={sc.icon} size={22} color={colors.teal} style={s.rowIcon} />
              <Text style={s.rowLabel}>{sc.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  iconBtn: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border,
  },

  who: { gap: 2 },
  whoName: { ...type.title },
  whoRole: { ...type.sub },

  // The one card on the screen allowed to carry brand colour: it is the only
  // thing here that is live.
  activeCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: alpha(colors.teal, 0.35),
    padding: space.lg,
    gap: space.sm,
  },
  activeTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.teal },
  activeLabel: {
    ...type.caption, color: colors.teal, fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  activeJob: { ...type.heading, fontSize: 20 },
  activeAddress: { ...type.sub, marginTop: -4 },
  activeSince: { ...type.caption, fontVariant: ['tabular-nums'] },
  resume: {
    marginTop: space.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 16,
  },
  resumePressed: { opacity: 0.85 },
  resumeTxt: { color: colors.base, fontSize: 16, fontWeight: '700' },

  idleCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  idleTitle: { ...type.heading },
  idleBody: { ...type.sub },
  idleBtn: {
    marginTop: space.sm, alignItems: 'center',
    borderRadius: radius.md, paddingVertical: 14,
    backgroundColor: colors.surface2,
  },
  idleBtnTxt: { ...type.body, fontWeight: '600' },

  list: {
    backgroundColor: colors.surface1, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.lg, paddingVertical: 18,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surface2 },
  rowIcon: { width: 24, textAlign: 'center' },
  rowLabel: { ...type.body, flex: 1 },
});
