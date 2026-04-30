import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData } from 'react-native-calendars';
import { authFetch } from '@/lib/api';

const C = {
  bg: '#0f1923', card: '#1a2635', teal: '#00d4a0',
  muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)',
  red: '#f87171', amber: '#fbbf24',
};

const TYPE_LABELS: Record<string, string> = {
  annual_leave: 'Annual leave',
  sick: 'Sick',
  personal: 'Personal',
  training: 'Training',
};

interface CalendarContext {
  user_id: string;
  leave_year: { start: string; end: string };
  balance: { entitlement: number; used: number; remaining: number };
  my_entries: Array<{
    id: string;
    type: string;
    start_date: string;
    end_date: string;
    status: 'pending' | 'approved' | 'rejected';
  }>;
  team_entries: Array<{ date: string; count: number }>;
  public_holidays: Array<{ date: string; name: string }>;
}

export default function CalendarPickerScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: string }>();
  const typeLabel = TYPE_LABELS[type || ''] || 'Time off';
  const isAnnualLeave = type === 'annual_leave';

  const [context, setContext] = useState<CalendarContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/installer/calendar-context');
        const data = await res.json();
        setContext(data);
      } catch (err) {
        console.error('[calendar] load failed', err);
      }
      setLoading(false);
    })();
  }, []);

  // Build markedDates for the calendar.
  // - Today: ringed
  // - Public holidays: dot below day
  // - My approved entries: filled (blocked from selection)
  // - Selected range: teal fill
  const markedDates = useMemo(() => {
    if (!context) return {};
    const marks: Record<string, any> = {};

    // Public holidays
    for (const h of context.public_holidays) {
      marks[h.date] = {
        ...(marks[h.date] || {}),
        marked: true,
        dotColor: C.amber,
      };
    }

    // My approved entries — blocked
    for (const e of context.my_entries) {
      if (e.status !== 'approved') continue;
      const days = expandDates(e.start_date, e.end_date);
      for (const d of days) {
        marks[d] = {
          ...(marks[d] || {}),
          disabled: true,
          disableTouchEvent: true,
          customStyles: {
            container: { backgroundColor: 'rgba(0,212,160,0.25)', borderRadius: 8 },
            text: { color: C.teal, fontWeight: '600' },
          },
        };
      }
    }

    // Selected range
    if (startDate) {
      const rangeEnd = endDate || startDate;
      const days = expandDates(startDate, rangeEnd);
      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        const isStart = i === 0;
        const isEnd = i === days.length - 1;
        marks[d] = {
          ...(marks[d] || {}),
          selected: true,
          startingDay: isStart,
          endingDay: isEnd,
          color: C.teal,
          textColor: C.bg,
        };
      }
    }

    return marks;
  }, [context, startDate, endDate]);

  function onDayPress(day: DateData) {
    const d = day.dateString;
    // If selected day is in an approved block, ignore
    const blocked = (context?.my_entries || []).some(
      (e) =>
        e.status === 'approved' &&
        d >= e.start_date &&
        d <= e.end_date
    );
    if (blocked) return;

    if (!startDate || (startDate && endDate)) {
      // Start a new range
      setStartDate(d);
      setEndDate(null);
      return;
    }
    // We have a start, no end — set end (or swap if before)
    if (d < startDate) {
      setEndDate(startDate);
      setStartDate(d);
    } else {
      setEndDate(d);
    }
  }

  // Compute selection summary
  const selection = useMemo(() => {
    if (!startDate) return null;
    const end = endDate || startDate;
    const days = countDays(startDate, end);
    return { start: startDate, end, days };
  }, [startDate, endDate]);

  // Compute balance impact (only for annual leave)
  const balanceImpact = useMemo(() => {
    if (!isAnnualLeave || !context || !selection) return null;
    const remaining = context.balance.remaining - selection.days;
    return {
      remaining,
      overage: remaining < 0 ? -remaining : 0,
    };
  }, [isAnnualLeave, context, selection]);

  function onContinue() {
    if (!selection) return;
    router.push({
      pathname: '/schedule-request/confirm' as any,
      params: {
        type,
        start_date: selection.start,
        end_date: selection.end,
        days: String(selection.days),
      },
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={C.teal} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={styles.headerTitle}>{typeLabel}</Text>
          <Text style={styles.headerSub}>Select dates</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.calendarWrap}>
        <Calendar
          markingType="custom"
          markedDates={markedDates}
          onDayPress={onDayPress}
          enableSwipeMonths
          firstDay={1}
          theme={{
            backgroundColor: C.bg,
            calendarBackground: C.bg,
            textSectionTitleColor: C.muted,
            dayTextColor: C.text,
            todayTextColor: C.teal,
            selectedDayBackgroundColor: C.teal,
            selectedDayTextColor: C.bg,
            monthTextColor: C.text,
            textMonthFontWeight: '500',
            textMonthFontSize: 17,
            textDayFontSize: 14,
            textDayHeaderFontSize: 12,
            arrowColor: C.teal,
            textDisabledColor: 'rgba(255,255,255,0.18)',
          }}
        />
      </View>

      {/* Public holiday tag for selected days */}
      {startDate && context && (() => {
        const ph = context.public_holidays.find((h) => h.date === startDate);
        if (!ph) return null;
        return (
          <View style={styles.holidayChip}>
            <Ionicons name="information-circle-outline" size={14} color={C.amber} />
            <Text style={styles.holidayChipText}>{startDate} is {ph.name}</Text>
          </View>
        );
      })()}

      {/* Footer summary (always visible) */}
      <View style={styles.footer}>
        {selection ? (
          <>
            <Text style={styles.footerMain}>
              {selection.days} {selection.days === 1 ? 'day' : 'days'} · {formatRange(selection.start, selection.end)}
            </Text>
            {balanceImpact ? (
              <Text style={[
                styles.footerSub,
                balanceImpact.overage > 0 && styles.footerSubError,
              ]}>
                {balanceImpact.overage > 0
                  ? `Goes over your balance by ${balanceImpact.overage} ${balanceImpact.overage === 1 ? 'day' : 'days'}`
                  : `After this you'll have ${balanceImpact.remaining} ${balanceImpact.remaining === 1 ? 'day' : 'days'} remaining`
                }
              </Text>
            ) : (
              <Text style={styles.footerSub}>Doesn't count against your annual leave balance</Text>
            )}
            <View style={styles.footerButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setStartDate(null); setEndDate(null); }}
              >
                <Text style={styles.cancelBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.continueBtn,
                  balanceImpact && balanceImpact.overage > 0 && styles.continueBtnDisabled,
                ]}
                onPress={onContinue}
                disabled={!!(balanceImpact && balanceImpact.overage > 0)}
              >
                <Text style={styles.continueBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={C.bg} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.footerHint}>Tap a day to start, then tap another to set the end.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// Helpers

function expandDates(start: string, end: string): string[] {
  const result: string[] = [];
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function countDays(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  return Math.round((e - s) / 86400000) + 1;
}

function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${s.toLocaleDateString('en-GB', { month: 'short' })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerBack: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '500' },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 2 },

  calendarWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },

  holidayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(251,191,36,0.1)',
    paddingHorizontal: 12, paddingVertical: 8,
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 8,
  },
  holidayChipText: { color: C.amber, fontSize: 12, flex: 1 },

  footer: {
    backgroundColor: C.card,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  footerMain: { color: C.text, fontSize: 16, fontWeight: '500', marginBottom: 4 },
  footerSub: { color: C.muted, fontSize: 13, marginBottom: 12 },
  footerSubError: { color: C.red },
  footerHint: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  footerButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  cancelBtnText: { color: C.muted, fontSize: 15, fontWeight: '500' },
  continueBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { color: C.bg, fontSize: 15, fontWeight: '600' },
});
