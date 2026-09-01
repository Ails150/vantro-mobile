import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch, authFormFetch } from '@/lib/api';
import ScreenHeader from '@/components/ScreenHeader';
import PrimaryButton from '@/components/PrimaryButton';
import EmptyState from '@/components/EmptyState';
import { alpha, colors, space, type } from '@/theme';

const C = { bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted, text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red, amber: colors.amber };

// `on` carries the text colour because the fills split two ways: amber and red
// are light enough to take the dark base, surface3 is not and needs white.
const SEVERITIES = [
  { label: 'Minor', value: 'minor', fill: colors.surface3, on: colors.textPrimary },
  { label: 'Major', value: 'major', fill: colors.amber, on: colors.base },
  { label: 'Critical', value: 'critical', fill: colors.red, on: colors.base },
] as const;

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
    <View style={s.safe}>
      <ScreenHeader title="Defects" subtitle={name} onBack={() => router.back()} />
      {offline && <View style={s.offlineBanner}><Text style={s.offlineTxt}>{'Offline \u2014 cached defects, new will queue'}</Text></View>}
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.sectionTitle}>Log a defect</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Describe the defect..." placeholderTextColor={C.muted} multiline numberOfLines={4} style={s.input} textAlignVertical="top" />
          <View style={s.severityRow}>
            {SEVERITIES.map(({ label, value, fill, on: onColor }) => {
              const selected = severity === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setSeverity(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[s.severityBtn, selected && { backgroundColor: fill, borderColor: fill }]}
                >
                  <Text style={[s.severityText, { color: selected ? onColor : fill }, selected && { fontWeight: '700' }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {photo ? <Image source={{ uri: photo }} style={s.photoPreview} /> : null}
          {video ? <View style={[s.photoPreview, {backgroundColor: colors.base, justifyContent: 'center', alignItems: 'center'}]}><Text style={{color: C.teal, fontSize: 14}}>Video selected</Text><Text style={{color: C.muted, fontSize: 11, marginTop: 4}}>Tap below to change</Text></View> : null}
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
          <PrimaryButton
            label={loading ? 'Submitting...' : success ? 'Logged' : 'Log defect'}
            blockedLabel="Add a description first"
            disabled={!description.trim() || loading}
            onPress={submit}
          />
        </View>

        {defects.length === 0 && (
          <EmptyState
            icon="warning-outline"
            title="No defects logged"
            body="Log an issue with a photo and it lands in the audit pack."
          />
        )}

        {defects.length > 0 && (
          <>
            <Text style={s.prevTitle}>Logged on this job ({defects.length})</Text>
            {defects.map(d => (
              <View key={d.id} style={s.defectCard}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <Text style={[s.badge, { color: severityColor(d.severity), borderColor: severityColor(d.severity) }]}>{d.severity}</Text>
                  <Text style={[s.badge, { color: d.status === 'resolved' ? C.teal : C.red, borderColor: d.status === 'resolved' ? C.teal : C.red }]}>{d.status}</Text>
                </View>
                <Text style={s.defectDesc}>{d.description}</Text>
                {d.photo_url ? <Image source={{ uri: d.photo_url }} style={s.defectPhoto} /> : null}
                {d.video_url ? <View style={[s.defectPhoto, {backgroundColor: colors.base, justifyContent: 'center', alignItems: 'center'}]}><Text style={{color: C.teal}}>Video attached</Text></View> : null}
                {d.resolution_note ? <Text style={s.resNote}>Resolution: {d.resolution_note}</Text> : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
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
  input: { backgroundColor: alpha(colors.textPrimary, 0.04), borderRadius: 10, padding: 12, color: C.text, fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: C.border },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  severityBtnActive: { backgroundColor: alpha(colors.textPrimary, 0.06) },
  severityText: { fontSize: 13, fontWeight: '500' },
  severityLabel: { ...type.caption, marginBottom: -space.xs },
  severityTextActive: { fontWeight: '700' },
  photoPreview: { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
  photoBtn: { backgroundColor: alpha(colors.textPrimary, 0.04), borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  photoBtnText: { color: C.teal, fontSize: 14 },
  submitBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: colors.base, fontWeight: '700', fontSize: 15 },
  prevTitle: { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 20, marginBottom: 10 },
  defectCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  badge: { fontSize: 12, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, fontWeight: '500' },
  defectDesc: { fontSize: 14, color: C.text },
  defectPhoto: { width: '100%', height: 130, borderRadius: 8, resizeMode: 'cover', marginTop: 8 },
  resNote: { fontSize: 12, color: C.muted, marginTop: 6 },
  offlineBanner: { backgroundColor: alpha(colors.amber, 0.12), borderColor: colors.amber, borderWidth: 1, marginHorizontal: 16, marginTop: 12, borderRadius: 8, padding: 10 },
  offlineTxt: { color: colors.amber, fontSize: 12, fontWeight: '500' },
});
