import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function DiaryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await authFetch('/api/diary?jobId=' + id);
    if (res.ok) { const data = await res.json(); setEntries(data.entries || []); }
  }

  async function submit() {
    if (!text.trim()) return;
    setLoading(true);
    const res = await authFetch('/api/diary', {
      method: 'POST',
      body: JSON.stringify({ jobId: id, entryText: text, companyId: user?.companyId, userId: user?.userId }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setText('');
      load();
      if (data.entry?.ai_alert_type && data.entry.ai_alert_type !== 'none') {
        Alert.alert(
          data.entry.ai_alert_type === 'blocker' ? 'Blocker flagged' : 'Issue flagged',
          data.entry.ai_summary || 'AI flagged this entry. Your manager has been notified.',
          [{ text: 'OK' }]
        );
      }
    }
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Site Diary</Text>
          <Text style={s.subtitle}>{name}</Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {entries.length === 0 && (
          <Text style={s.empty}>No diary entries yet. Log what happened on site today.</Text>
        )}
        {entries.map((entry: any) => (
          <View key={entry.id} style={s.entryBlock}>
            <View style={s.entryBubble}>
              <Text style={s.entryText}>{entry.entry_text}</Text>
              {entry.ai_alert_type && entry.ai_alert_type !== 'none' && (
                <View style={[s.alertTag, entry.ai_alert_type === 'blocker' ? s.alertTagRed : s.alertTagAmber]}>
                  <Text style={[s.alertTagText, entry.ai_alert_type === 'blocker' ? {color: C.red} : {color: C.amber}]}>
                    {entry.ai_alert_type === 'blocker' ? 'BLOCKER' : 'ISSUE'} — {entry.ai_summary}
                  </Text>
                </View>
              )}
              <Text style={s.entryTime}>{formatTime(entry.created_at)}</Text>
            </View>
            {entry.reply && (
              <View style={s.replyBubble}>
                <Text style={s.replyLabel}>Manager reply</Text>
                <Text style={s.replyText}>{entry.reply}</Text>
                <Text style={s.entryTime}>{entry.replied_at ? formatTime(entry.replied_at) : ''}</Text>
              </View>
            )}
          </View>
        ))}

        <View style={s.inputCard}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What happened on site today? Log progress, issues, blockers..."
            placeholderTextColor={C.muted}
            multiline
            numberOfLines={5}
            style={s.input}
            textAlignVertical="top"
          />
          <View style={s.cardFooter}>
            <Text style={s.charCount}>{text.length} characters</Text>
            <TouchableOpacity
              style={[s.submitBtn, (!text.trim() || loading) && s.submitBtnDisabled]}
              onPress={submit}
              disabled={!text.trim() || loading}
            >
              <Text style={s.submitBtnText}>{loading ? 'Submitting...' : 'Submit entry'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={s.aiNote}>AI reads your entry and alerts the manager to any issues or blockers.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { padding: 4 },
  backText: { fontSize: 22, color: C.muted },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  subtitle: { fontSize: 12, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 32, fontSize: 14 },
  entryBlock: { marginBottom: 16 },
  entryBubble: { backgroundColor: C.card, borderRadius: 14, borderTopRightRadius: 4, padding: 14, borderWidth: 1, borderColor: C.border, alignSelf: 'flex-end', maxWidth: '90%' },
  entryText: { color: C.text, fontSize: 14, lineHeight: 22 },
  entryTime: { color: C.muted, fontSize: 11, marginTop: 6, textAlign: 'right' },
  alertTag: { borderRadius: 6, padding: 8, marginTop: 8 },
  alertTagRed: { backgroundColor: 'rgba(248,113,113,0.1)' },
  alertTagAmber: { backgroundColor: 'rgba(251,191,36,0.1)' },
  alertTagText: { fontSize: 12 },
  replyBubble: { backgroundColor: 'rgba(0,212,160,0.08)', borderRadius: 14, borderTopLeftRadius: 4, padding: 14, borderWidth: 1, borderColor: 'rgba(0,212,160,0.2)', alignSelf: 'flex-start', maxWidth: '90%', marginTop: 6 },
  replyLabel: { fontSize: 11, color: C.teal, fontWeight: '600', marginBottom: 4 },
  replyText: { color: C.text, fontSize: 14, lineHeight: 22 },
  inputCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  input: { color: C.text, fontSize: 15, lineHeight: 24, minHeight: 120 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  charCount: { fontSize: 12, color: C.muted },
  submitBtn: { backgroundColor: C.teal, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 14, fontWeight: '600', color: '#0f1923' },
  aiNote: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 16, paddingHorizontal: 20 },
});
