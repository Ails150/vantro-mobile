import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image, Alert, ActivityIndicator } from 'react-native';
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
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [submitProgress, setSubmitProgress] = useState('');

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

  async function recordVideo(itemId: string) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['videos'], videoMaxDuration: 120 });
      if (!result.canceled && result.assets?.length > 0) {
        setVideos(v => ({ ...v, [itemId]: result.assets[0].uri }));
      }
    } catch (e) { Alert.alert('Error', 'Could not open camera.'); }
  }

  async function pickVideoFromLibrary(itemId: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Library access is required.'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['videos'], videoMaxDuration: 120 });
      if (!result.canceled && result.assets?.length > 0) {
        setVideos(v => ({ ...v, [itemId]: result.assets[0].uri }));
      }
    } catch (e) { Alert.alert('Error', 'Could not open library.'); }
  }

  function removeVideo(itemId: string) {
    setVideos(v => { const n = { ...v }; delete n[itemId]; return n; });
  }

  function removePhoto(itemId: string, idx: number) {
    setPhotos(p => ({ ...p, [itemId]: (p[itemId] || []).filter((_: any, i: number) => i !== idx) }));
  }

  // Check if a mandatory item is ready to submit (has required data)
  function isMandatoryReady(item: any): boolean {
    const state = getState(item.id);
    if (state !== 'pending') return true; // already submitted
    const needsPhoto = item.requires_photo || item.item_type === 'photo';
    const hasPhotos = (photos[item.id] || []).length > 0;
    if (needsPhoto && !hasPhotos) return false; // photo required but not taken
    if (item.item_type === 'measurement' && !(notes[item.id] || '').trim()) return false; // measurement needs a value
    // tick and pass_fail items just need to be submitted - we auto-submit them
    return true;
  }

  // Upload photos for a single item and submit it
  async function submitSingleItem(itemId: string, state: string): Promise<boolean> {
    const photoList = photos[itemId] || [];
    let photoUrl = '', photoPath = '';

    console.log('[QA-SUBMIT] itemId=', itemId, 'photos=', photoList.length, 'video=', !!videos[itemId]);

    if (photoList.length > 0) {
      for (let i = 0; i < photoList.length; i++) {
        try {
          console.log('[QA-PHOTO] uploading', i, 'uri=', photoList[i]);
          const form = new FormData();
          form.append('file', { uri: photoList[i], type: 'image/jpeg', name: 'qa_' + Date.now() + '_' + i + '.jpg' } as any);
          form.append('jobId', id as string);
          form.append('itemId', itemId);
          const upRes = await authFormFetch('/api/upload', form);
          console.log('[QA-PHOTO] status=', upRes?.status);
          if (upRes.ok) {
            const d = await upRes.json();
            if (i === 0) { photoUrl = d.url; photoPath = d.path; }
          } else {
            console.error('Upload failed:', upRes.status);
            return false;
          }
        } catch (e) {
          console.error('Photo upload error:', e);
          return false;
        }
      }
    }

    let videoUrl = '', videoPath = '';
    const videoUri = videos[itemId];
    if (videoUri) {
      try {
        console.log('[QA-VIDEO] upload START');
        // Step 1: Get direct upload URL from /api/stream/upload-url
        const urlRes = await authFetch('/api/stream/upload-url', { method: 'POST' });
        if (!urlRes.ok) {
          console.error('[QA-VIDEO] upload-url failed:', urlRes.status);
          return false;
        }
        const { uploadURL, uid, embedUrl } = await urlRes.json();
        console.log('[QA-VIDEO] got uploadURL, uid=', uid);

        // Step 2: Direct upload to Cloudflare (bypasses Vercel 4.5MB limit)
        const form = new FormData();
        form.append('file', { uri: videoUri, type: 'video/mp4', name: 'qa_' + Date.now() + '.mp4' } as any);
        const cfRes = await fetch(uploadURL, { method: 'POST', body: form });
        console.log('[QA-VIDEO] direct upload status=', cfRes?.status);
        if (!cfRes.ok) {
          console.error('[QA-VIDEO] direct upload failed:', cfRes.status);
          return false;
        }

        videoUrl = embedUrl;
        videoPath = uid;
        console.log('[QA-VIDEO] SUCCESS embedUrl=', embedUrl);
      } catch (e) {
        console.error('[QA-VIDEO] upload exception:', e);
        return false;
      }
    }

    try {
      await authFetch('/api/qa', {
        method: 'POST',
        body: JSON.stringify({ jobId: id, itemId, templateId: checklist.id, state, notes: notes[itemId] || '', photoUrl, photoPath, videoUrl, videoPath }),
      });
      return true;
    } catch (e) {
      console.error('Submit error:', e);
      return false;
    }
  }

  async function submitForApproval() {
    // Check all mandatory items have their required data (photos taken, measurements filled)
    const mandatoryItems = items.filter((i: any) => i.is_mandatory);
    const unready = mandatoryItems.filter((i: any) => !isMandatoryReady(i));

    if (unready.length > 0) {
      const labels = unready.map((i: any) => i.label).join(', ');
      Alert.alert('Missing data', `Complete these mandatory items first: ${labels}`);
      return;
    }

    setSubmitting(true);

    // Auto-submit all pending items that have data
    const pendingItems = items.filter((i: any) => getState(i.id) === 'pending');
    let submitCount = 0;

    for (const item of pendingItems) {
      const hasPhotos = (photos[item.id] || []).length > 0;
      const hasNotes = (notes[item.id] || '').trim();
      const needsPhoto = item.requires_photo || item.item_type === 'photo';

      // Skip items that have no data and aren't mandatory
      if (!item.is_mandatory && !hasPhotos && !hasNotes && item.item_type !== 'tick') continue;

      // Determine the state to submit
      let state = 'submitted';
      if (item.item_type === 'pass_fail') state = 'pass'; // default to pass for auto-submit

      setSubmitProgress(`Submitting ${item.label}...`);

      // Skip photo-required items with no photos (non-mandatory only, mandatory already checked above)
      if (needsPhoto && !hasPhotos) continue;

      const ok = await submitSingleItem(item.id, state);
      if (ok) submitCount++;
    }

    // Now submit the whole checklist for approval
    setSubmitProgress('Sending for approval...');
    await authFetch('/api/qa/submit', { method: 'POST', body: JSON.stringify({ jobId: id, templateId: checklist.id }) });

    setSubmitting(false);
    setSubmitProgress('');
    setSubmitted(s => ({ ...s, [checklist.id]: true }));
    load();
  }

  // Individual item submit (for when user taps Pass/Fail/Mark complete on a single item)
  async function submit(itemId: string, state: string) {
    const photoList = photos[itemId] || [];
    const item = items.find((i: any) => i.id === itemId);
    const needsPhoto = item?.requires_photo || item?.item_type === 'photo';

    if (needsPhoto && photoList.length === 0) {
      Alert.alert('Photo required', 'Please add a photo before submitting this item.');
      return;
    }

    setUploading(u => ({ ...u, [itemId]: true }));
    await submitSingleItem(itemId, state);
    setUploading(u => ({ ...u, [itemId]: false }));
    load();
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
              <View style={{ gap: 6, marginTop: 8 }}>
                {submitting && submitProgress ? (
                  <View style={[s.submitBtn, { flexDirection: 'row', gap: 10, justifyContent: 'center' }]}>
                    <ActivityIndicator size="small" color="#0f1923" />
                    <Text style={s.submitBtnText}>{submitProgress}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[s.submitBtn, submitted[checklist.id] && s.submitBtnDone]}
                    onPress={submitForApproval}
                    disabled={submitting || submitted[checklist.id]}
                  >
                    <Text style={[s.submitBtnText, submitted[checklist.id] && s.submitBtnTextDone]}>
                      {submitted[checklist.id] ? 'Submitted' : checklist.requires_approval ? 'Submit for approval' : 'Mark complete'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
        {!loading && (
          <TouchableOpacity
            style={{ borderWidth: 1, borderColor: C.teal, borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16 }}
            onPress={() => router.push({ pathname: '/(installer)/checklist-library' as any, params: { jobId: id, jobName: name } })}
          >
            <Text style={{ color: C.teal, fontSize: 14, fontWeight: '600' }}>+ Add optional checklist</Text>
          </TouchableOpacity>
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