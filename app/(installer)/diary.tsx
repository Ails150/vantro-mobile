import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)' };

export default function DiaryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
      setSuccess(true);
      setText('');
      if (data.entry?.ai_alert_type && data.entry.ai_alert_type !== 'none') {
        Alert.alert(
          data.entry.ai_alert_type === 'blocker' ? 'ðŸš¨ Blocker flagged' : 'âš ï¸ Issue flagged',
          data.entry.ai_summary || 'AI flagged this entry. Your manager has been notified.',
          [{ text: 'OK' }]
        );
      }
      setTimeout(() => setSuccess(false), 2000);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>â†</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Site Diary</Text>
          <Text style={s.subtitle}>{name}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What happened on site today? Log progress, issues, blockers, or anything the office needs to know..."
            placeholderTextColor={C.muted}
            multiline
            numberOfLines={8}
            style={s.input}
            textAlignVertical="top"
          />
          <View style={s.cardFooter}>
            <Text style={s.charCount}>{text.length} characters</Text>
            <TouchableOpacity
              style={[s.submitBtn, (!text.trim() || loading) && s.submitBtnDisabled, success && s.submitBtnSuccess]}
              onPress={submit}
              disabled={!text.trim() || loading}
            >
              <Text style={s.submitBtnText}>{success ? 'Submitted âœ“' : loading ? 'Submitting...' : 'Submit entry'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={s.aiNote}>AI reads your entry and alerts the foreman to any issues or blockers.</Text>
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
  scroll: { padding: 16 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  input: { color: C.text, fontSize: 15, lineHeight: 24, minHeight: 160 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  charCount: { fontSize: 12, color: C.muted },
  submitBtn: { backgroundColor: C.teal, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnSuccess: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(0,212,160,0.3)' },
  submitBtnText: { fontSize: 14, fontWeight: '600', color: '#0f1923' },
  aiNote: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 16, paddingHorizontal: 20 },
});
