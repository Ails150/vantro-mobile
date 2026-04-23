import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView, Alert, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch, authFormFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171' };

export default function ChecklistRunScreen() {
  const { jobId, jobName, templateId, templateName } = useLocalSearchParams<{ jobId: string; jobName: string; templateId: string; templateName: string }>();
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submittedItems, setSubmittedItems] = useState<Record<string, string>>({}); // itemId -> state

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await authFetch('/api/installer/checklists/library?jobId=' + jobId);
      if (res.ok) {
        const data = await res.json();
        const template = (data.library || []).find((t: any) => t.id === templateId);
        if (template) setItems(template.items || []);
      }
    } catch {}
    setLoading(false);
  }

  function getState(itemId: string) {
    return submittedItems[itemId] || 'pending';
  }

  async function takePhoto(itemId: string) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera access required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!result.canceled && result.assets?.length > 0) {
      setPhotos(p => ({ ...p, [itemId]: [...(p[itemId] || []), result.assets[0].uri] }));
    }
  }

  async function pickFromLibrary(itemId: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Library access required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!result.canceled && result.assets?.length > 0) {
      setPhotos(p => ({ ...p, [itemId]: [...(p[itemId] || []), result.assets[0].uri] }));
    }
  }

  async function recordVideo(itemId: string) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera access required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['videos'], videoMaxDuration: 120 });
    if (!result.canceled && result.assets?.length > 0) {
      setVideos(v => ({ ...v, [itemId]: result.assets[0].uri }));
    }
  }

  async function pickVideoFromLibrary(itemId: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Library access required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['videos'], videoMaxDuration: 120 });
    if (!result.canceled && result.assets?.length > 0) {
      setVideos(v => ({ ...v, [itemId]: result.assets[0].uri }));
    }
  }

  function removePhoto(itemId: string, idx: number) {
    setPhotos(p => ({ ...p, [itemId]: (p[itemId] || []).filter((_: any, i: number) => i !== idx) }));
  }

  function removeVideo(itemId: string) {
    setVideos(v => { const n = { ...v }; delete n[itemId]; return n; });
  }

  async function submit(itemId: string, state: string) {
    const item = items.find(i => i.id === itemId);
    const photoList = photos[itemId] || [];
    const videoUri = videos[itemId];
    const needsPhoto = item?.requires_photo || item?.item_type === 'photo';

    if (needsPhoto && photoList.length === 0) {
      Alert.alert('Photo required', 'Please add a photo before submitting.');
      return;
    }

    setUploading(u => ({ ...u, [itemId]: true }));
    let photoUrl = '', photoPath = '';
    let videoUrl = '', videoPath = '';

    try {
      // Upload photos
      for (let i = 0; i < photoList.length; i++) {
        const form = new FormData();
        form.append('file', { uri: photoList[i], type: 'image/jpeg', name: 'qa_' + Date.now() + '_' + i + '.jpg' } as any);
        form.append('path', 'qa/' + jobId + '/' + itemId + '/photo_' + Date.now() + '_' + i + '.jpg');
        const upRes = await authFormFetch('/api/upload', form);
        if (upRes.ok) {
          const d = await upRes.json();
          if (i === 0) { photoUrl = d.url; photoPath = d.path; }
        } else { throw new Error('Photo upload failed'); }
      }

      // Upload video if any
      if (videoUri) {
        const form = new FormData();
        form.append('file', { uri: videoUri, type: 'video/mp4', name: 'qa_' + Date.now() + '.mp4' } as any);
        form.append('path', 'qa/' + jobId + '/' + itemId + '/video_' + Date.now() + '.mp4');
        const upRes = await authFormFetch('/api/upload', form);
        if (upRes.ok) {
          const d = await upRes.json();
          videoUrl = d.url; videoPath = d.path;
        } else { throw new Error('Video upload failed'); }
      }

      // Submit
      await authFetch('/api/qa', {
        method: 'POST',
        body: JSON.stringify({ jobId, itemId, templateId, state, notes: notes[itemId] || '', photoUrl, photoPath, videoUrl, videoPath }),
      });

      setSubmittedItems(s => ({ ...s, [itemId]: state }));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit');
    }
    setUploading(u => ({ ...u, [itemId]: false }));
  }

  function renderPhotoSection(itemId: string) {
    const itemPhotos = photos[itemId] || [];
    const itemVideo = videos[itemId];
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
        {itemVideo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(139,92,246,0.1)', padding: 10, borderRadius: 10 }}>
            <Text style={{ color: '#a78bfa', fontSize: 13, flex: 1 }}>Video attached</Text>
            <TouchableOpacity onPress={() => removeVideo(itemId)}><Text style={{ color: '#f87171', fontSize: 12 }}>Remove</Text></TouchableOpacity>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.photoBtn, { flex: 1 }]} onPress={() => takePhoto(itemId)}>
            <Text style={s.photoBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.photoBtn, { flex: 1 }]} onPress={() => pickFromLibrary(itemId)}>
            <Text style={s.photoBtnText}>Gallery</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.photoBtn, { flex: 1 }]} onPress={() => recordVideo(itemId)}>
            <Text style={s.photoBtnText}>Record video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.photoBtn, { flex: 1 }]} onPress={() => pickVideoFromLibrary(itemId)}>
            <Text style={s.photoBtnText}>Pick video</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>Back</Text></TouchableOpacity>
        <View>
          <Text style={s.title}>{templateName}</Text>
          <Text style={s.subtitle}>{jobName}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {loading && <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />}

        {!loading && items.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>This checklist has no items</Text>
          </View>
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
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    {item.is_mandatory && <Text style={s.tagRed}>Mandatory</Text>}
                    {item.requires_photo && <Text style={s.tagBlue}>Photo</Text>}
                    {item.requires_video && <Text style={s.tagBlue}>Video</Text>}
                  </View>
                </View>
                {done && (
                  <View style={[s.stateBadge, state === 'pass' || state === 'done' || state === 'submitted' ? s.stateBadgeGreen : s.stateBadgeRed]}>
                    <Text style={[s.stateText, state === 'pass' || state === 'done' || state === 'submitted' ? s.stateTextGreen : s.stateTextRed]}>
                      {state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : 'Done'}
                    </Text>
                  </View>
                )}
              </View>

              {!done && (
                <View style={{ gap: 10 }}>
                  {renderPhotoSection(item.id)}

                  <TextInput
                    value={notes[item.id] || ''}
                    onChangeText={t => setNotes(n => ({ ...n, [item.id]: t }))}
                    placeholder="Notes (optional)"
                    placeholderTextColor={C.muted}
                    multiline
                    style={s.input}
                  />

                  {item.item_type === 'tick' && (
                    <TouchableOpacity
                      style={[s.actionBtn, (needsPhoto && !hasPhotos) && s.actionBtnDisabled]}
                      disabled={uploading[item.id] || (needsPhoto && !hasPhotos)}
                      onPress={() => submit(item.id, 'done')}
                    >
                      <Text style={s.actionBtnText}>{uploading[item.id] ? 'Uploading...' : 'Mark done'}</Text>
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
                    <TouchableOpacity
                      style={[s.actionBtn, (needsPhoto && !hasPhotos) && s.actionBtnDisabled]}
                      disabled={uploading[item.id] || (needsPhoto && !hasPhotos)}
                      onPress={() => submit(item.id, 'submitted')}
                    >
                      <Text style={s.actionBtnText}>{uploading[item.id] ? 'Uploading...' : 'Save measurement'}</Text>
                    </TouchableOpacity>
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
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: C.muted, fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardDone: { opacity: 0.6 },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  itemLabel: { fontSize: 14, fontWeight: '500', color: C.text },
  tagRed: { fontSize: 11, color: C.red },
  tagBlue: { fontSize: 11, color: '#60a5fa' },
  stateBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  stateBadgeGreen: { backgroundColor: 'rgba(0,212,160,0.1)' },
  stateBadgeRed: { backgroundColor: 'rgba(248,113,113,0.1)' },
  stateText: { fontSize: 12, fontWeight: '500' },
  stateTextGreen: { color: C.teal },
  stateTextRed: { color: C.red },
  actionBtn: { backgroundColor: 'rgba(0,212,160,0.1)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,212,160,0.2)' },
  actionBtnRed: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.2)' },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 14, color: C.teal, fontWeight: '500' },
  actionBtnTextRed: { color: C.red },
  input: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border, minHeight: 44 },
  photoPreview: { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
  photoBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  photoBtnText: { color: C.teal, fontSize: 14 },
  removePhotoBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});