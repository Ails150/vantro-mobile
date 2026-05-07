import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch, authFormFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

const DEFECT_CACHE_KEY = 'vantro_defects_cache';
const DEFECT_QUEUE_KEY = 'vantro_defects_queue';

export default function DefectsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const [defects, setDefects] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [photo, setPhoto] = useState('');
  const [video, setVideo] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const cacheKey = DEFECT_CACHE_KEY + '_' + id;
    try {
      const res = await authFetch(`/api/defects?jobId=${id}`);
      const data = await res.json();
      const fetched = data.defects || [];
      setDefects(fetched);
      setOffline(false);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(fetched));
      await flushQueue();
    } catch (e) {
      console.log('[DEFECTS] load failed, using cache', e);
      setOffline(true);
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) setDefects(JSON.parse(raw));
    }
  }

  async function flushQueue() {
    try {
      const raw = await AsyncStorage.getItem(DEFECT_QUEUE_KEY);
      if (!raw) return;
      const queue: any[] = JSON.parse(raw);
      if (!queue.length) return;
      const remaining: any[] = [];
      for (const item of queue) {
        try {
          const res = await authFetch('/api/defects', {
            method: 'POST',
            body: JSON.stringify(item),
          });
          if (!res.ok) remaining.push(item);
        } catch {
          remaining.push(item);
        }
      }
      if (remaining.length === 0) {
        await AsyncStorage.removeItem(DEFECT_QUEUE_KEY);
        console.log('[DEFECTS] queue flushed');
      } else {
        await AsyncStorage.setItem(DEFECT_QUEUE_KEY, JSON.stringify(remaining));
      }
    } catch (e) { console.log('[DEFECTS] flush error', e); }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission required'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled) { setPhoto(result.assets[0].uri); setVideo(''); }
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled) { setPhoto(result.assets[0].uri); setVideo(''); }
  }

  async function takeVideo() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission required'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 60 });
    if (!result.canceled) { setVideo(result.assets[0].uri); setPhoto(''); }
  }

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Videos });
    if (!result.canceled) { setVideo(result.assets[0].uri); setPhoto(''); }
  }

  async function submit() {
    if (!description.trim()) return;
    setLoading(true);
    let photoUrl = '', photoPath = '', videoUrl = '', videoPath = '';
    try {
      if (photo) {
        const form = new FormData();
        form.append('file', { uri: photo, type: 'image/jpeg', name: 'defect.jpg' } as any);
        form.append('jobId', id);
        form.append('itemId', 'defect');
        console.log('[DEFECTS] uploading photo to /api/upload');
        const upRes = await authFormFetch('/api/upload', form);
        console.log('[DEFECTS] photo upload status:', upRes.status);
        if (upRes.ok) {
          const d = await upRes.json();
          photoUrl = d.url; photoPath = d.path;
          console.log('[DEFECTS] photo uploaded:', d.url);
        } else {
          const errText = await upRes.text();
          console.log('[DEFECTS] PHOTO UPLOAD FAILED:', upRes.status, errText);
          throw new Error('Photo upload failed: ' + upRes.status + ' ' + errText);
        }
      }
      if (video) {
        const form = new FormData();
        form.append('file', { uri: video, type: 'video/mp4', name: 'defect.mp4' } as any);
        form.append('jobId', id);
        form.append('itemId', 'defect-video');
        console.log('[DEFECTS] uploading video to /api/upload');
        const upRes = await authFormFetch('/api/upload', form);
        console.log('[DEFECTS] upload response status:', upRes.status);
        if (upRes.ok) {
          const d = await upRes.json();
          videoUrl = d.url; videoPath = d.path;
          console.log('[DEFECTS] video uploaded:', d.url);
        } else {
          const errText = await upRes.text();
          console.log('[DEFECTS] VIDEO UPLOAD FAILED:', upRes.status, errText);
          throw new Error('Video upload failed: ' + upRes.status + ' ' + errText);
        }
      }
      const payload = { action: 'create', jobId: id, description, severity, photoUrl, photoPath, videoUrl, videoPath };
      const res = await authFetch('/api/defects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('http ' + res.status);
      setDescription(''); setPhoto(''); setVideo(''); setSeverity('minor');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      load();
    } catch (err) {
      console.log('[DEFECTS] submit failed, queueing', err);
      try {
        const raw = await AsyncStorage.getItem(DEFECT_QUEUE_KEY);
        const queue: any[] = raw ? JSON.parse(raw) : [];
        queue.push({ action: 'create', jobId: id, description, severity, photoUrl, photoPath, videoUrl, videoPath });
        await AsyncStorage.setItem(DEFECT_QUEUE_KEY, JSON.stringify(queue));
        setDescription(''); setPhoto(''); setVideo(''); setSeverity('minor');
        Alert.alert('Queued', 'Defect will sync when online');
      } catch (e) {
        Alert.alert('Error', 'Failed to queue defect');
      }
    }
    setLoading(false);
  }

  const severityColor = (s: string) => s === 'critical' ? C.red : s === 'major' ? C.amber : C.muted;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>{'\u2190'}</Text></TouchableOpacity>
        <View><Text style={s.title}>Defects</Text><Text style={s.subtitle}>{name}</Text></View>
      </View>
      {offline && <View style={s.offlineBanner}><Text style={s.offlineTxt}>{'Offline \u2014 cached defects, new will queue'}</Text></View>}
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.sectionTitle}>Log a defect</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Describe the defect..." placeholderTextColor={C.muted} multiline numberOfLines={4} style={s.input} textAlignVertical="top" />
          <View style={s.severityRow}>
            {[{l:'Minor',v:'minor',c:'#4d6478'},{l:'Major',v:'major',c:'#fbbf24'},{l:'Critical',v:'critical',c:'#f87171'}].map(({l,v,c}) => (
              <TouchableOpacity key={v} onPress={() => setSeverity(v)}
                style={[s.severityBtn, severity===v && {backgroundColor: c, borderColor: c}]}>
                <Text style={[s.severityText, {color: severity===v ? (v==='minor'?'#fff':'#0f1923') : c}, severity===v && {fontWeight:'700'}]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {photo ? <Image source={{ uri: photo }} style={s.photoPreview} /> : null}
          {video ? <View style={[s.photoPreview, {backgroundColor: '#0f1923', justifyContent: 'center', alignItems: 'center'}]}><Text style={{color: C.teal, fontSize: 14}}>Video selected</Text><Text style={{color: C.muted, fontSize: 11, marginTop: 4}}>Tap below to change</Text></View> : null}
          <View style={{flexDirection: 'row', gap: 8}}>
            <TouchableOpacity style={[s.photoBtn, {flex: 1}]} onPress={takePhoto}>
              <Text style={s.photoBtnText}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.photoBtn, {flex: 1}]} onPress={pickPhoto}>
              <Text style={s.photoBtnText}>Add photo</Text>
            </TouchableOpacity>
          </View>
          <View style={{flexDirection: 'row', gap: 8}}>
            <TouchableOpacity style={[s.photoBtn, {flex: 1}]} onPress={takeVideo}>
              <Text style={s.photoBtnText}>Take video</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.photoBtn, {flex: 1}]} onPress={pickVideo}>
              <Text style={s.photoBtnText}>Add video</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[s.submitBtn, (!description.trim() || loading) && s.submitBtnDisabled]} onPress={submit} disabled={!description.trim() || loading}>
            <Text style={s.submitBtnText}>{loading ? 'Submitting...' : success ? 'Logged! \u2713' : 'Log defect'}</Text>
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
                {d.video_url ? <View style={[s.defectPhoto, {backgroundColor: '#0f1923', justifyContent: 'center', alignItems: 'center'}]}><Text style={{color: C.teal}}>Video attached</Text></View> : null}
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
  back: { color: C.text, fontSize: 22 },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 100 },
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
  offlineBanner: { backgroundColor: 'rgba(251, 191, 36, 0.12)', borderColor: '#fbbf24', borderWidth: 1, marginHorizontal: 16, marginTop: 12, borderRadius: 8, padding: 10 },
  offlineTxt: { color: '#fbbf24', fontSize: 12, fontWeight: '500' },
});
