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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  function allMandatoryComplete() {
    const mandatory = items.filter(item => item.is_mandatory);
    return mandatory.every(item => {
      const state = subs.find(s => s.checklist_item_id === item.id)?.state;
      return state && state !== "pending";
    });
  }

  async function submitForApproval() {
    if (!allMandatoryComplete()) {
      Alert.alert("Cannot submit", "All mandatory checklist items must be completed before submitting for approval.");
      return;
    }
    setSubmitting(true);
    await authFetch("/api/qa/submit", { method: "POST", body: JSON.stringify({ jobId: id }) });
    setSubmitting(false);
    setSubmitted(true);
    load();
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
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>â†</Text></TouchableOpacity>
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
      {items.length > 0 && (
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }}>
          <TouchableOpacity
            style={{ backgroundColor: submitted ? "rgba(0,212,160,0.1)" : "#00d4a0", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: submitted ? 1 : 0, borderColor: "rgba(0,212,160,0.3)" }}
            onPress={submitForApproval}
            disabled={submitting || submitted}
          >
            <Text style={{ color: submitted ? "#00d4a0" : "#0f1923", fontWeight: "700", fontSize: 15 }}>
              {submitted ? "Submitted for approval" : submitting ? "Submitting..." : "Submit QA for approval"}
            </Text>
          </TouchableOpacity>
        </View>
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
