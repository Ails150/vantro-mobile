import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';

const C = {
  bg: '#0f1923', card: '#1a2635', teal: '#00d4a0',
  muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)',
  red: '#f87171', amber: '#fbbf24', subtle: 'rgba(255,255,255,0.04)',
};

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const TYPE_LABELS: Record<string, string> = {
  annual_leave: 'Annual leave',
  sick: 'Sick',
  personal: 'Personal',
  bereavement: 'Bereavement',
  training: 'Training',
  unpaid: 'Unpaid',
  unavailable: 'Unavailable',
};

const TYPE_ICONS: Record<string, string> = {
  annual_leave: '🏖️',
  sick: '🤒',
  personal: '👪',
  bereavement: '🕊️',
  training: '🎓',
  unpaid: '⏸️',
  unavailable: '🚫',
};

interface CalendarContext {
  user_id: string;
  user_name: string;
  country_code: string;
  leave_year: { start: string; end: string };
  balance: { entitlement: number; used: number; remaining: number };
  weekly_schedule: Record<string, { enabled?: boolean; working?: boolean; start: string | null; end: string | null }>; // schedule_field_fixed
  my_entries: Array<{
    id: string;
    type: string;
    start_date: string;
    end_date: string;
    status: 'pending' | 'approved' | 'rejected';
    is_half_day: boolean;
    note: string | null;
    created_at: string;
  }>;
  public_holidays: Array<{ date: string; name: string }>;
}

export default function ScheduleScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [context, setContext] = useState<CalendarContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/installer/calendar-context');
      if (res.status === 401) {
        await logout();
        router.replace('/login');
        return;
      }
      const data = await res.json();
      setContext(data);
    } catch (err) {
      console.error('[schedule] load failed', err);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={C.teal} />
        </View>
      </SafeAreaView>
    );
  }

  if (!context) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <Text style={styles.muted}>Couldn't load your schedule. Pull to refresh.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const balance = context.balance;
  const usedPercent = balance.entitlement > 0
    ? Math.min(100, (balance.used / balance.entitlement) * 100)
    : 0;

  const sortedEntries = [...context.my_entries].sort((a, b) =>
    b.start_date.localeCompare(a.start_date)
  );

  const pendingCount = sortedEntries.filter((e) => e.status === 'pending').length;

  const nextHoliday = context.public_holidays.find(
    (h) => h.date >= new Date().toISOString().slice(0, 10)
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={C.teal}
          />
        }
      >
        {/* Request button */}
        <TouchableOpacity
          style={styles.requestButton}
          onPress={() => router.push('/schedule-request/type' as any)}
        >
          <Ionicons name="add-circle" size={22} color={C.bg} />
          <Text style={styles.requestButtonText}>Request time off</Text>
        </TouchableOpacity>

        {pendingCount > 0 && (
          <View style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={16} color={C.amber} />
            <Text style={styles.pendingText}>
              {pendingCount} request{pendingCount === 1 ? '' : 's'} awaiting approval
            </Text>
          </View>
        )}

        {/* Working hours card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My working hours</Text>
          <View style={styles.daysRow}>
            {DAY_NAMES.map((d) => {
              const day = context.weekly_schedule?.[d];
              const working = !!(day?.enabled ?? day?.working);
              return (
                <View key={d} style={styles.dayCell}>
                  <Text style={[styles.dayLabel, !working && styles.dayLabelOff]}>
                    {DAY_LABELS[d]}
                  </Text>
                  <Text style={[styles.dayHours, !working && styles.dayHoursOff]}>
                    {working ? `${day.start}\n${day.end}` : 'Off'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Holiday balance card */}
        <View style={styles.card}>
          <View style={styles.balanceHeader}>
            <Text style={styles.cardTitle}>Holiday balance</Text>
            <Text style={styles.balanceRemaining}>
              {balance.remaining} {balance.remaining === 1 ? 'day' : 'days'} left
            </Text>
          </View>
          <View style={styles.balanceBar}>
            <View style={[styles.balanceFill, { width: `${usedPercent}%` }]} />
          </View>
          <Text style={styles.balanceFootnote}>
            {balance.used} of {balance.entitlement} used · year ends {formatDate(context.leave_year.end)}
          </Text>
        </View>

        {/* Next public holiday */}
        {nextHoliday && (
          <View style={styles.card}>
            <Text style={styles.cardTitleSmall}>Next public holiday</Text>
            <View style={styles.holidayRow}>
              <View>
                <Text style={styles.holidayName}>{nextHoliday.name}</Text>
                <Text style={styles.holidayDate}>{formatDate(nextHoliday.date)}</Text>
              </View>
              <Ionicons name="calendar-outline" size={20} color={C.muted} />
            </View>
          </View>
        )}

        {/* My time off list */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My time off</Text>
          {sortedEntries.length === 0 ? (
            <Text style={styles.empty}>You haven't requested any time off yet.</Text>
          ) : (
            sortedEntries.map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <Text style={styles.entryEmoji}>{TYPE_ICONS[entry.type] || '📅'}</Text>
                <View style={styles.entryBody}>
                  <Text style={styles.entryType}>
                    {TYPE_LABELS[entry.type] || entry.type}
                    {entry.is_half_day ? ' · half day' : ''}
                  </Text>
                  <Text style={styles.entryDates}>
                    {formatDateRange(entry.start_date, entry.end_date)}
                  </Text>
                  {entry.note ? (
                    <Text style={styles.entryNote} numberOfLines={2}>
                      {entry.note}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.statusPill, statusPillStyle(entry.status)]}>
                  <Text style={[styles.statusText, statusTextStyle(entry.status)]}>
                    {entry.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  if (sameMonth) {
    return `${s.getUTCDate()} – ${e.getUTCDate()} ${e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function statusPillStyle(status: string) {
  if (status === 'approved') return { backgroundColor: 'rgba(0,212,160,0.15)' };
  if (status === 'rejected') return { backgroundColor: 'rgba(248,113,113,0.15)' };
  return { backgroundColor: 'rgba(251,191,36,0.15)' };
}
function statusTextStyle(status: string) {
  if (status === 'approved') return { color: C.teal };
  if (status === 'rejected') return { color: C.red };
  return { color: C.amber };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.muted, fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerBack: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '500' },

  scrollContent: { padding: 16 },

  requestButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.teal, paddingVertical: 14, borderRadius: 12,
    gap: 8, marginBottom: 16,
  },
  requestButtonText: { color: C.bg, fontSize: 16, fontWeight: '600' },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  pendingText: { color: C.amber, fontSize: 13, flex: 1 },

  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '500', marginBottom: 12 },
  cardTitleSmall: { color: C.muted, fontSize: 12, fontWeight: '500', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { flex: 1, alignItems: 'center' },
  dayLabel: { color: C.text, fontSize: 13, fontWeight: '500', marginBottom: 6 },
  dayLabelOff: { color: C.muted },
  dayHours: { color: C.text, fontSize: 11, textAlign: 'center', lineHeight: 14 },
  dayHoursOff: { color: C.muted, fontStyle: 'italic' },

  balanceHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  balanceRemaining: { color: C.teal, fontSize: 14, fontWeight: '600' },
  balanceBar: {
    height: 8, backgroundColor: C.subtle, borderRadius: 4, overflow: 'hidden',
    marginBottom: 8,
  },
  balanceFill: { height: '100%', backgroundColor: C.teal, borderRadius: 4 },
  balanceFootnote: { color: C.muted, fontSize: 12 },

  holidayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  holidayName: { color: C.text, fontSize: 15, fontWeight: '500' },
  holidayDate: { color: C.muted, fontSize: 13, marginTop: 2 },

  empty: { color: C.muted, fontSize: 13, paddingVertical: 8 },

  entry: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border,
  },
  entryEmoji: { fontSize: 24, lineHeight: 28 },
  entryBody: { flex: 1, gap: 2 },
  entryType: { color: C.text, fontSize: 14, fontWeight: '500' },
  entryDates: { color: C.muted, fontSize: 13 },
  entryNote: { color: C.muted, fontSize: 12, fontStyle: 'italic', marginTop: 4 },

  statusPill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  statusText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
});
