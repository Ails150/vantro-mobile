import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  TextInput, Switch, ScrollView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

const TYPE_EMOJI: Record<string, string> = {
  annual_leave: '🏖️',
  sick: '🤒',
  personal: '👪',
  training: '🎓',
};

export default function ConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    type: string;
    start_date: string;
    end_date: string;
    days: string;
  }>();

  const type = params.type || 'annual_leave';
  const startDate = params.start_date || '';
  const endDate = params.end_date || '';
  const days = parseInt(params.days || '1', 10);
  const isSingleDay = startDate === endDate;

  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<'am' | 'pm'>('am');
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const effectiveDays = isSingleDay && isHalfDay ? 0.5 : days;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/installer/time-off', {
        method: 'POST',
        body: JSON.stringify({
          type,
          start_date: startDate,
          end_date: endDate,
          is_half_day: isHalfDay && isSingleDay,
          half_day_period: isHalfDay && isSingleDay ? halfDayPeriod : null,
          notes: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Could not submit', data.error || 'Please try again.');
        setSubmitting(false);
        return;
      }
      // Pop back to /schedule
      router.dismissAll();
      router.replace('/schedule' as any);
    } catch (err) {
      Alert.alert('Could not submit', 'Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
            <Ionicons name="chevron-back" size={28} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryEmoji}>{TYPE_EMOJI[type]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryType}>{TYPE_LABELS[type]}</Text>
                <Text style={styles.summaryDates}>{formatRange(startDate, endDate)}</Text>
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={styles.summaryValue}>
                {effectiveDays} {effectiveDays === 1 ? 'day' : 'days'}
              </Text>
            </View>
          </View>

          {/* Half day toggle (single day only) */}
          {isSingleDay && (
            <View>
              <View style={styles.optionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>Half day only</Text>
                  <Text style={styles.optionSub}>Use 0.5 days from your balance instead of 1</Text>
                </View>
                <Switch
                  value={isHalfDay}
                  onValueChange={setIsHalfDay}
                  trackColor={{ false: C.border, true: C.teal }}
                  thumbColor={'#fff'}
                />
              </View>
              {isHalfDay && (
                <View style={styles.periodRow}>
                  <TouchableOpacity
                    style={[styles.periodChip, halfDayPeriod === 'am' && styles.periodChipActive]}
                    onPress={() => setHalfDayPeriod('am')}
                  >
                    <Text style={[styles.periodChipText, halfDayPeriod === 'am' && styles.periodChipTextActive]}>
                      Morning
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.periodChip, halfDayPeriod === 'pm' && styles.periodChipActive]}
                    onPress={() => setHalfDayPeriod('pm')}
                  >
                    <Text style={[styles.periodChipText, halfDayPeriod === 'pm' && styles.periodChipTextActive]}>
                      Afternoon
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Note (optional, expandable) */}
          {showNote ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteLabel}>Note (optional)</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Add a reason..."
                placeholderTextColor={C.muted}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={500}
              />
              <Text style={styles.noteHint}>Visible to your admin only.</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.noteToggle}
              onPress={() => setShowNote(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color={C.muted} />
              <Text style={styles.noteToggleText}>Add a reason</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.disclaimer}>
            Your admin will be notified. You'll get a push when it's approved or declined.
          </Text>
        </ScrollView>

        {/* Submit button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={C.bg} />
            ) : (
              <>
                <Text style={styles.submitBtnText}>Submit request</Text>
                <Ionicons name="checkmark-circle" size={20} color={C.bg} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerBack: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '500' },

  body: { padding: 16, gap: 12 },

  summaryCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryEmoji: { fontSize: 32 },
  summaryType: { color: C.text, fontSize: 17, fontWeight: '500' },
  summaryDates: { color: C.muted, fontSize: 13, marginTop: 2 },
  summaryDivider: {
    height: 1, backgroundColor: C.border, marginVertical: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: C.muted, fontSize: 13 },
  summaryValue: { color: C.teal, fontSize: 15, fontWeight: '600' },

  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 14, padding: 16,
  },
  optionLabel: { color: C.text, fontSize: 15, fontWeight: '500' },
  optionSub: { color: C.muted, fontSize: 12, marginTop: 2 },

  noteCard: { backgroundColor: C.card, borderRadius: 14, padding: 16 },
  noteLabel: { color: C.text, fontSize: 14, fontWeight: '500', marginBottom: 8 },
  noteInput: {
    color: C.text, fontSize: 14, minHeight: 80, textAlignVertical: 'top',
    backgroundColor: C.bg, borderRadius: 8, padding: 12,
  },
  noteHint: { color: C.muted, fontSize: 11, marginTop: 6 },

  noteToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
  },
  noteToggleText: { color: C.muted, fontSize: 14 },

  disclaimer: {
    color: C.muted, fontSize: 12, textAlign: 'center',
    paddingHorizontal: 12, marginTop: 8,
  },

  footer: {
    padding: 16, paddingBottom: 24,
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.card,
  },
  submitBtn: {
    backgroundColor: C.teal, paddingVertical: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: C.bg, fontSize: 16, fontWeight: '600' },

  periodRow: {
    flexDirection: 'row', gap: 8,
    backgroundColor: C.card, borderRadius: 14,
    padding: 12, paddingTop: 0, marginTop: -2,
  },
  periodChip: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  periodChipActive: { backgroundColor: C.teal, borderColor: C.teal },
  periodChipText: { color: C.muted, fontSize: 14, fontWeight: '500' },
  periodChipTextActive: { color: C.bg, fontWeight: '600' },
});
