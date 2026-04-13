import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch, authFormFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171' };

export default function QAScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const [checklists, setChecklists] = useState<any[]>([]);
  const [activeChecklist, setActiveChecklist] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await authFetch(`/api/qa?jobId=${id}`);
    const data = await res.json();
    setChecklists(data.checklists || []);
    setLoading(false);
  }

  const checklist = checklists[activeChecklist];
  const items = checklist?.items || [];
  const subs = checklist?.submissions || [];

  function getState(itemId: string) {
    return subs.find((s: any) => s.checklist_item_id === itemId)?.state || 'pending';
  }

  async function takePhoto(itemId: string) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required to take photos.'); return; }
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['images'] });
      if (!result.canceled && result.assets?.length > 0) {
        const uri = result.assets[0].uri;
        setPhotos(p => ({ ...p, [itemId]: [...(p[itemId] || []), uri] }));
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open camera. Please try again.');
    }
  }

  async function pickFromLibrary(itemId: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const uri = result.assets[0].uri;
        setPhotos(p => ({ ...p, [itemId]: [...(p[itemId] || []), uri] }));
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open photo library. Please try again.');
    }
  }

  function removePhoto(itemId: string, idx: number) {
    setPhotos(p => ({ ...p, [itemId]: (p[itemId] || []).filter((_: any, i: number) => i !== idx) }));
  }

  function allMandatoryComplete() {
    return items.filter((i: any) => i.is_mandatory).every((i: any) => {
      const state = getState(i.id);
      return state && state !== 'pending';
    });
  }

  async function submitForApproval() {
    if (!allMandatoryComplete()) {
      Alert.alert('Cannot submit', 'Complete all mandatory items first.');
      return;
    }
    setSubmitting(true);
    await authFetch('/api/qa/submit', { method: 'POST', body: JSON.stringify({ jobId: id, templateId: checklist.id }) });
    setSubmitting(false);
    setSubmitted(s => ({ ...s, [checklist.id]: true }));
    load();
  }

  async function submit(itemId: string, state: string) {
    const photoList = photos[itemId] || [];
    let photoUrl = '', photoPath = '';

    // Check if photo is required but none provided
    const item = items.find((i: any) => i.id === itemId);
    if ((item?.requires_photo || item?.item_type === 'photo') && photoList.length === 0) {
      Alert.alert('Photo required', 'Please add a photo before submitting this item.');
      return;
    }

    // Upload photos if any
    if (photoList.length > 0) {
      setUploading(u => ({ ...u, [itemId]: true }));
      for (let i = 0; i < photoList.length; i++) {
        try {
          const form = new FormData();
          form.append('file', { uri: photoList[i], type: 'image/jpeg', name: 'qa_' + Date.now() + '_' + i + '.jpg' } as any);
          form.append('jobId', id as string);
          form.append('itemId', itemId);
          const upRes = await authFormFetch('/api/upload', form);
          if (upRes.ok) {
            const d = await upRes.json();
            if (i === 0) { photoUrl = d.url; photoPath = d.path; }
          } else {
            const errText = await upRes.text();
            console.error('Upload failed:', upRes.status, errText);
          }
        } catch (e) {
          console.error('Photo upload error:', e);
        }
      }
      setUploading(u => ({ ...u, [itemId]: false }));
    }

    await authFetch('/api/qa', {
      method: 'POST',
      body: JSON.stringify({ jobId: id, itemId, templateId: checklist.id, state, notes: notes[itemId] || '', photoUrl, photoPath }),
    });
    load();
  }

  function renderPhotoSection(itemId: string) {
    const itemPhotos = photos[itemId] || [];
    return (
      <View style={{ gap: 8 }}>
        {itemPhotos.map((uri: string, idx: number) => (
          <View key={idx} style={{ position: 'relative' }}>
            <Image source={{ uri }} style={s.photoPreview} />
            <TouchableOpacity onPress={() => removePhoto(itemId, idx)} style={s.removePhotoBtn}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>x</Text>
            </TouchableOpacity>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.photoBtn, { flex: 1 }]} onPress={() => takePhoto(itemId)}>
            <Text style={s.photoBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.photoBtn, { flex: 1 }]} onPress={() => pickFromLibrary(itemId)}>
            <Text style={s.photoBtnText}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>Back</Text></TouchableOpacity>
        <View><Text style={s.title}>QA Checklists</Text><Text style={s.subtitle}>{name}</Text></View>
      </View>

      {!loading && checklists.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {checklists.map((cl: any, i: number) => {
            const done = submitted[cl.id];
            return (
              <TouchableOpacity key={cl.id} onPress={() => setActiveChecklist(i)}
                style={[s.tab, activeChecklist === i && s.tabActive]}>
                <Text style={[s.tabText, activeChecklist === i && s.tabTextActive]}>{cl.name}</Text>
                {done && <Text style={{ color: C.teal, fontSize: 10, marginLeft: 4 }}>Done</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={s.scroll}>
        {loading && <Text style={s.loading}>Loading checklists...</Text>}
        {!loading && checklists.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No checklists assigned to this job</Text>
            <Text style={s.emptySubText}>Ask your manager to assign one</Text>
          </View>
        )}
        {checklist && (
          <>
            {checklist.requires_approval && (
              <View style={s.badge}><Text style={s.badgeText}>Requires approval</Text></View>
            )}
            {checklist.audit_only && (
              <View style={[s.badge, s.badgeAudit]}><Text style={s.badgeText}>Audit record</Text></View>
            )}
            {items.map((item: any) => {
              const state = getState(item.id);
              const done = state !== 'pending';
              const needsPhoto = item.requires_photo || item.item_type === 'photo';
              const hasPhotos = (photos[item.id] || []).length > 0;

              return (
                <View key={item.id} style={[s.card, done && s.cardDone]}>
                  <View style={s.itemHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemLabel}>{item.label}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {item.is_mandatory && <Text style={s.tagRed}>Mandatory</Text>}
                        {needsPhoto && <Text style={s.tagBlue}>Photo required</Text>}
                      </View>
                    </View>
                    <View style={[s.stateBadge, state === 'pass' || state === 'submitted' ? s.stateBadgeGreen : state === 'fail' ? s.stateBadgeRed : s.stateBadgeGrey]}>
                      <Text style={[s.stateText, state === 'pass' || state === 'submitted' ? s.stateTextGreen : state === 'fail' ? s.stateTextRed : s.stateTextGrey]}>
                        {state === 'submitted' ? 'Done' : state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : 'Pending'}
                      </Text>
                    </View>
                  </View>

                  {!done && (
                    <View style={{ gap: 10 }}>
                      {needsPhoto && renderPhotoSection(item.id)}

                      {item.item_type !== 'measurement' && (
                        <TextInput
                          value={notes[item.id] || ''}
                          onChangeText={t => setNotes(n => ({ ...n, [item.id]: t }))}
                          placeholder="Add a note (optional)..."
                          placeholderTextColor={C.muted}
                          multiline
                          style={[s.input, { minHeight: 44 }]}
                          textAlignVertical="top"
                        />
                      )}

                      {item.item_type === 'tick' && (
                        <TouchableOpacity
                          style={[s.actionBtn, (needsPhoto && !hasPhotos) && s.actionBtnDisabled]}
                          disabled={uploading[item.id] || (needsPhoto && !hasPhotos)}
                          onPress={() => submit(item.id, 'submitted')}
                        >
                          <Text style={s.actionBtnText}>{uploading[item.id] ? 'Uploading...' : 'Mark complete'}</Text>
                        </TouchableOpacity>
                      )}

                      {item.item_type === 'pass_fail' && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[s.actionBtn, { flex: 1 }, (needsPhoto && !hasPhotos) && s.actionBtnDisabled]}
                            disabled={uploading[item.id] || (needsPhoto && !hasPhotos)}
                            onPress={() => submit(item.id, 'pass')}
                          >
                            <Text style={s.actionBtnText}>{uploading[item.id] ? 'Uploading...' : 'Pass'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, s.actionBtnRed, { flex: 1 }, (needsPhoto && !hasPhotos) && s.actionBtnDisabled]}
                            disabled={uploading[item.id] || (needsPhoto && !hasPhotos)}
                            onPress={() => submit(item.id, 'fail')}
                          >
                            <Text style={[s.actionBtnText, s.actionBtnTextRed]}>{uploading[item.id] ? 'Uploading...' : 'Fail'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {item.item_type === 'measurement' && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            value={notes[item.id] || ''}
                            onChangeText={t => setNotes(n => ({ ...n, [item.id]: t }))}
                            placeholder="Enter measurement"
                            placeholderTextColor={C.muted}
                            style={[s.input, { flex: 1 }]}
                          />
                          <TouchableOpacity
                            style={[s.actionBtn, (needsPhoto && !hasPhotos) && s.actionBtnDisabled]}
                            disabled={uploading[item.id] || (needsPhoto && !hasPhotos)}
                            onPress={() => submit(item.id, 'submitted')}
                          >
                            <Text style={s.actionBtnText}>{uploading[item.id] ? 'Uploading...' : 'Save'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {item.item_type === 'photo' && (
                        <TouchableOpacity
                          style={[s.actionBtn, !hasPhotos && s.actionBtnDisabled]}
                          disabled={!hasPhotos || uploading[item.id]}
                          onPress={() => submit(item.id, 'submitted')}
                        >
                          <Text style={s.actionBtnText}>{uploading[item.id] ? 'Uploading...' : 'Submit with photos'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            {items.length > 0 && (
              <TouchableOpacity
                style={[s.submitBtn, submitted[checklist.id] && s.submitBtnDone]}
                onPress={submitForApproval}
                disabled={submitting || submitted[checklist.id]}
              >
                <Text style={[s.submitBtnText, submitted[checklist.id] && s.submitBtnTextDone]}>
                  {submitted[checklist.id] ? 'Submitted' : submitting ? 'Submitting...' : checklist.requires_approval ? 'Submit for approval' : 'Mark complete'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { fontSize: 15, color: C.muted },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  subtitle: { fontSize: 12, color: C.muted },
  tabs: { borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)', flexDirection: 'row', alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(0,212,160,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.3)' },
  tabText: { fontSize: 13, color: C.muted },
  tabTextActive: { color: C.teal, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 40 },
  loading: { color: C.muted, textAlign: 'center', marginTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: C.muted, fontSize: 15 },
  emptySubText: { color: C.muted, fontSize: 13, marginTop: 4, opacity: 0.6 },
  badge: { backgroundColor: 'rgba(0,212,160,0.08)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12, alignSelf: 'flex-start' },
  badgeAudit: { backgroundColor: 'rgba(255,255,255,0.05)' },
  badgeText: { color: C.teal, fontSize: 12 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardDone: { opacity: 0.6 },
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
  input: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border },
  photoPreview: { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
  photoBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  photoBtnText: { color: C.teal, fontSize: 14 },
  removePhotoBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  submitBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitBtnDone: { backgroundColor: 'rgba(0,212,160,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.3)' },
  submitBtnText: { color: '#0f1923', fontWeight: '700', fontSize: 15 },
  submitBtnTextDone: { color: C.teal },
});