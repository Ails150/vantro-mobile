Set-Location C:\vantro-mobile

# ─── app/(installer)/diary.tsx ───────────────────────────────
@'
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
          data.entry.ai_alert_type === 'blocker' ? '🚨 Blocker flagged' : '⚠️ Issue flagged',
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
          <Text style={s.backText}>←</Text>
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
              <Text style={s.submitBtnText}>{success ? 'Submitted ✓' : loading ? 'Submitting...' : 'Submit entry'}</Text>
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
'@ | Set-Content "app/(installer)/diary.tsx" -Encoding UTF8

# ─── app/(installer)/qa.tsx ──────────────────────────────────
@'
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch, authFormFetch, getToken } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171' };

export default function QAScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await authFetch(`/api/qa?jobId=${id}`);
    const data = await res.json();
    setItems(data.items || []);
    setSubs(data.submissions || []);
    setLoading(false);
  }

  function getState(itemId: string) {
    return subs.find(s => s.checklist_item_id === itemId)?.state || 'pending';
  }

  async function pickPhoto(itemId: string) {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhotos(p => ({ ...p, [itemId]: result.assets[0].uri }));
  }

  async function submit(itemId: string, state: string) {
    const token = await getToken();
    const photo = photos[itemId];
    let photoUrl = '', photoPath = '';

    if (photo) {
      setUploading(u => ({ ...u, [itemId]: true }));
      const form = new FormData();
      form.append('file', { uri: photo, type: 'image/jpeg', name: 'qa.jpg' } as any);
      form.append('jobId', id);
      form.append('itemId', itemId);
      const upRes = await authFormFetch('/api/upload', form);
      if (upRes.ok) { const d = await upRes.json(); photoUrl = d.url; photoPath = d.path; }
      setUploading(u => ({ ...u, [itemId]: false }));
    }

    await authFetch('/api/qa', {
      method: 'POST',
      body: JSON.stringify({ jobId: id, itemId, state, notes: notes[itemId] || '', photoUrl, photoPath }),
    });
    setSubs(prev => {
      const ex = prev.find(s => s.checklist_item_id === itemId);
      if (ex) return prev.map(s => s.checklist_item_id === itemId ? { ...s, state, notes: notes[itemId] || '' } : s);
      return [...prev, { checklist_item_id: itemId, state, notes: notes[itemId] || '' }];
    });
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>←</Text></TouchableOpacity>
        <View><Text style={s.title}>QA Checklist</Text><Text style={s.subtitle}>{name}</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {loading && <Text style={s.loading}>Loading checklist...</Text>}
        {!loading && items.length === 0 && (
          <View style={s.empty}><Text style={s.emptyText}>No checklist set for this job</Text><Text style={s.emptySubText}>Ask your manager to add one</Text></View>
        )}
        {items.map(item => {
          const state = getState(item.id);
          const done = state !== 'pending';
          return (
            <View key={item.id} style={[s.card, done && s.cardDone]}>
              <View style={s.itemHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemLabel}>{item.label}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {item.is_mandatory && <Text style={s.tagRed}>Mandatory</Text>}
                    {item.requires_photo && <Text style={s.tagBlue}>Photo required</Text>}
                  </View>
                </View>
                <View style={[s.stateBadge, state === 'pass' || state === 'submitted' ? s.stateBadgeGreen : state === 'fail' ? s.stateBadgeRed : s.stateBadgeGrey]}>
                  <Text style={[s.stateText, state === 'pass' || state === 'submitted' ? s.stateTextGreen : state === 'fail' ? s.stateTextRed : s.stateTextGrey]}>
                    {state === 'submitted' ? 'Done' : state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : 'Pending'}
                  </Text>
                </View>
              </View>

              {!done && item.item_type === 'tick' && (
                <TouchableOpacity style={s.actionBtn} onPress={() => submit(item.id, 'submitted')}>
                  <Text style={s.actionBtnText}>Mark complete</Text>
                </TouchableOpacity>
              )}
              {!done && item.item_type === 'pass_fail' && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[s.actionBtn, { flex: 1 }]} onPress={() => submit(item.id, 'pass')}><Text style={s.actionBtnText}>Pass</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, s.actionBtnRed, { flex: 1 }]} onPress={() => submit(item.id, 'fail')}><Text style={[s.actionBtnText, s.actionBtnTextRed]}>Fail</Text></TouchableOpacity>
                </View>
              )}
              {!done && item.item_type === 'measurement' && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput value={notes[item.id] || ''} onChangeText={t => setNotes(n => ({ ...n, [item.id]: t }))} placeholder="Enter measurement" placeholderTextColor={C.muted} style={s.input} />
                  <TouchableOpacity style={s.actionBtn} onPress={() => submit(item.id, 'submitted')}><Text style={s.actionBtnText}>Submit</Text></TouchableOpacity>
                </View>
              )}
              {!done && item.item_type === 'photo' && (
                <View style={{ gap: 8 }}>
                  {photos[item.id] && <Image source={{ uri: photos[item.id] }} style={s.photoPreview} />}
                  <TouchableOpacity style={s.photoBtn} onPress={() => pickPhoto(item.id)}>
                    <Text style={s.photoBtnText}>{photos[item.id] ? 'Retake photo' : 'Take photo'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, !photos[item.id] && s.actionBtnDisabled]} disabled={!photos[item.id] || uploading[item.id]} onPress={() => submit(item.id, 'submitted')}>
                    <Text style={s.actionBtnText}>{uploading[item.id] ? 'Uploading...' : 'Submit with photo'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!done && item.fail_note_required && state === 'fail' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput value={notes[item.id] || ''} onChangeText={t => setNotes(n => ({ ...n, [item.id]: t }))} placeholder="Note required on fail" placeholderTextColor={C.muted} style={[s.input, { flex: 1 }]} />
                  <TouchableOpacity style={[s.actionBtn, s.actionBtnRed]} onPress={() => submit(item.id, 'fail')}><Text style={[s.actionBtnText, s.actionBtnTextRed]}>Submit</Text></TouchableOpacity>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { fontSize: 22, color: C.muted },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  subtitle: { fontSize: 12, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  loading: { color: C.muted, textAlign: 'center', marginTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: C.muted, fontSize: 15 },
  emptySubText: { color: C.muted, fontSize: 13, marginTop: 4, opacity: 0.6 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardDone: { opacity: 0.7 },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  itemLabel: { fontSize: 14, fontWeight: '500', color: C.text },
  tagRed: { fontSize: 11, color: C.red },
  tagBlue: { fontSize: 11, color: '#60a5fa' },
  stateBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  stateBadgeGreen: { backgroundColor: 'rgba(0,212,160,0.1)' },
  stateBadgeRed: { backgroundColor: 'rgba(248,113,113,0.1)' },
  stateBadgeGrey: { backgroundColor: 'rgba(255,255,255,0.05)' },
  stateText: { fontSize: 12, fontWeight: '500' },
  stateTextGreen: { color: C.teal },
  stateTextRed: { color: C.red },
  stateTextGrey: { color: C.muted },
  actionBtn: { backgroundColor: 'rgba(0,212,160,0.1)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,212,160,0.2)' },
  actionBtnRed: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.2)' },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 14, color: C.teal, fontWeight: '500' },
  actionBtnTextRed: { color: C.red },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border },
  photoPreview: { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
  photoBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  photoBtnText: { color: C.teal, fontSize: 14 },
});
'@ | Set-Content "app/(installer)/qa.tsx" -Encoding UTF8

# ─── app/(installer)/defects.tsx ─────────────────────────────
@'
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch, authFormFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function DefectsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const [defects, setDefects] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [photo, setPhoto] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await authFetch(`/api/defects?jobId=${id}`);
    const data = await res.json();
    setDefects(data.defects || []);
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function submit() {
    if (!description.trim()) return;
    setLoading(true);
    let photoUrl = '', photoPath = '';
    if (photo) {
      const form = new FormData();
      form.append('file', { uri: photo, type: 'image/jpeg', name: 'defect.jpg' } as any);
      form.append('jobId', id);
      form.append('itemId', 'defect');
      const upRes = await authFormFetch('/api/upload', form);
      if (upRes.ok) { const d = await upRes.json(); photoUrl = d.url; photoPath = d.path; }
    }
    await authFetch('/api/defects', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', jobId: id, description, severity, photoUrl, photoPath }),
    });
    setDescription(''); setPhoto(''); setSeverity('minor');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
    setLoading(false);
    load();
  }

  const severityColor = (s: string) => s === 'critical' ? C.red : s === 'major' ? C.amber : C.muted;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>←</Text></TouchableOpacity>
        <View><Text style={s.title}>Defects</Text><Text style={s.subtitle}>{name}</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.sectionTitle}>Log a defect</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Describe the defect..." placeholderTextColor={C.muted} multiline numberOfLines={4} style={s.input} textAlignVertical="top" />
          <View style={s.severityRow}>
            {['minor','major','critical'].map(sev => (
              <TouchableOpacity key={sev} onPress={() => setSeverity(sev)} style={[s.severityBtn, severity === sev && s.severityBtnActive]}>
                <Text style={[s.severityText, { color: severityColor(sev) }, severity === sev && s.severityTextActive]}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {photo ? <Image source={{ uri: photo }} style={s.photoPreview} /> : null}
          <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
            <Text style={s.photoBtnText}>{photo ? 'Retake photo' : '📷 Add photo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.submitBtn, (!description.trim() || loading) && s.submitBtnDisabled]} onPress={submit} disabled={!description.trim() || loading}>
            <Text style={s.submitBtnText}>{loading ? 'Submitting...' : success ? 'Logged! ✓' : 'Log defect'}</Text>
          </TouchableOpacity>
        </View>

        {defects.length > 0 && (
          <>
            <Text style={s.prevTitle}>Previous defects</Text>
            {defects.map(d => (
              <View key={d.id} style={s.defectCard}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <Text style={[s.badge, { color: severityColor(d.severity), borderColor: severityColor(d.severity) }]}>{d.severity}</Text>
                  <Text style={[s.badge, { color: d.status === 'resolved' ? C.teal : C.red, borderColor: d.status === 'resolved' ? C.teal : C.red }]}>{d.status}</Text>
                </View>
                <Text style={s.defectDesc}>{d.description}</Text>
                {d.photo_url ? <Image source={{ uri: d.photo_url }} style={s.defectPhoto} /> : null}
                {d.resolution_note ? <Text style={s.resNote}>Resolution: {d.resolution_note}</Text> : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { fontSize: 22, color: C.muted },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  subtitle: { fontSize: 12, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  input: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, color: C.text, fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: C.border },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  severityBtnActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  severityText: { fontSize: 13, fontWeight: '500' },
  severityTextActive: { fontWeight: '700' },
  photoPreview: { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
  photoBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  photoBtnText: { color: C.teal, fontSize: 14 },
  submitBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#0f1923', fontWeight: '700', fontSize: 15 },
  prevTitle: { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 20, marginBottom: 10 },
  defectCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  badge: { fontSize: 12, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, fontWeight: '500' },
  defectDesc: { fontSize: 14, color: C.text },
  defectPhoto: { width: '100%', height: 130, borderRadius: 8, resizeMode: 'cover', marginTop: 8 },
  resNote: { fontSize: 12, color: C.muted, marginTop: 6 },
});
'@ | Set-Content "app/(installer)/defects.tsx" -Encoding UTF8

Write-Host "Part 5 done - diary, QA, defects screens created" -ForegroundColor Green
