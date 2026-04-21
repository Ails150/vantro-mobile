import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, AppState, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';
import { isOnline, queueAction, syncQueue } from '@/lib/offline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE } from '@/constants/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function DiaryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [offline, setOffline] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [video, setVideo] = useState<string|null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const appState = useRef(AppState.currentState);
  const DIARY_CACHE_KEY = 'vantro_diary_' + id;

  const load = useCallback(async () => {
    const online = await isOnline();
    if (online) {
      try {
        await syncQueue(authFetch);
        const res = await authFetch('/api/diary?jobId=' + id);
        if (res.ok) {
          const data = await res.json();
          const fetched = data.entries || [];
          setEntries(fetched);
          await AsyncStorage.setItem(DIARY_CACHE_KEY, JSON.stringify(fetched));
          setOffline(false);
        }
      } catch {
        const raw = await AsyncStorage.getItem(DIARY_CACHE_KEY);
        setEntries(raw ? JSON.parse(raw) : []);
        setOffline(true);
      }
    } else {
      const raw = await AsyncStorage.getItem(DIARY_CACHE_KEY);
      setEntries(raw ? JSON.parse(raw) : []);
      setOffline(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') await load();
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to attach images'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.7 });
    if (!result.canceled) setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to take photos'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setPhotos(prev => [...prev, result.assets[0].uri]);
  }

  async function uploadPhotos(photoUris: string[]): Promise<string[]> {
    const urls: string[] = [];
    for (const uri of photoUris) {
      try {
        const filename = 'diary_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg';
        const formData = new FormData();
        formData.append('file', { uri, name: filename, type: 'image/jpeg' } as any);
        formData.append('bucket', 'diary-media');
        formData.append('path', filename);
        const res = await authFetch('/api/upload', { method: 'POST', body: formData, headers: {} });
        if (res.ok) {
          const data = await res.json();
          urls.push(data.url);
        }
      } catch (e) { console.error('Upload error:', e); }
    }
    return urls;
  }

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.7, videoMaxDuration: 120 });
    if (!result.canceled) setVideo(result.assets[0].uri);
  }

  async function recordVideo() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to record video'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 120, quality: 0.7 });
    if (!result.canceled) setVideo(result.assets[0].uri);
  }

  async function uploadVideo(uri: string): Promise<string|null> {
    try {
      const filename = 'diary_video_' + Date.now() + '.mp4';
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type: 'video/mp4' } as any);
      const res = await authFetch('/api/stream', { method: 'POST', body: formData, headers: {} });
      if (res.ok) {
        const data = await res.json();
        return data.embedUrl || null;
      }
    } catch (e) { console.error('Video upload error:', e); }
    return null;
  }

  async function submit() {
    if (!text.trim() && photos.length === 0) return;
    setLoading(true);
    setUploading(photos.length > 0);
    try {
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        const online = await isOnline();
        if (online) photoUrls = await uploadPhotos(photos);
      }
      setUploading(false);
      const online = await isOnline();
      if (online) {
        const res = await authFetch('/api/diary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: id, entryText: text.trim() || (video ? '🎥 Video entry' : '📷 Photo entry'), photoUrls, videoUrl: video ? await uploadVideo(video) : null })
        });
        if (res.ok) {
          setText('');
          setPhotos([]);
          await load();
          scrollRef.current?.scrollToEnd({ animated: true });
        }
      } else {
        await queueAction({ type: 'diary', payload: { jobId: id, entryText: text.trim() || '📷 Photo entry', photoUrls } });
        setText('');
        setPhotos([]);
        Alert.alert('Queued', 'Entry will sync when online');
      }
    } catch (e) { Alert.alert('Error', 'Failed to submit'); }
    setLoading(false);
    setUploading(false);
  }

  function removePhoto(uri: string) { setPhotos(prev => prev.filter(p => p !== uri)); }

  const alertColor = (t: string) => t === 'blocker' ? C.red : t === 'issue' ? C.amber : C.teal;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><Text style={s.backTxt}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={s.title} numberOfLines={1}>{name}</Text><Text style={s.sub}>Site Diary</Text></View>
      </View>
      {offline && <View style={s.offlineBanner}><Text style={s.offlineTxt}>Offline — showing cached entries</Text></View>}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
        {entries.map((e: any) => (
          <View key={e.id} style={[s.entry, e.ai_alert_type && e.ai_alert_type !== 'none' && { borderLeftWidth: 3, borderLeftColor: alertColor(e.ai_alert_type) }]}>
            <View style={s.entryRow}>
              {e.ai_alert_type && e.ai_alert_type !== 'none' && (
                <View style={[s.badge, { backgroundColor: alertColor(e.ai_alert_type) + '22' }]}>
                  <Text style={[s.badgeTxt, { color: alertColor(e.ai_alert_type) }]}>{e.ai_alert_type.toUpperCase()}</Text>
                </View>
              )}
              <Text style={s.entryTime}>{new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            {e.entry_text && e.entry_text !== '📷 Photo entry' && <Text style={s.entryText}>{e.entry_text}</Text>}
            {e.ai_summary && e.ai_alert_type !== 'none' && <Text style={[s.aiSummary, { color: alertColor(e.ai_alert_type) }]}>AI: {e.ai_summary}</Text>}
            {e.photo_urls && e.photo_urls.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {e.photo_urls.map((url: string, i: number) => (
                  <Image key={i} source={{ uri: url }} style={s.photoThumb} />
                ))}
              </ScrollView>
            )}
            {e.reply && (
              <View style={s.replyBox}>
                <Text style={s.replyLabel}>Admin reply</Text>
                <Text style={s.replyText}>{e.reply}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      {video && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1a2635' }}>
          <Text style={{ color: '#00d4a0', fontSize: 13 }}>🎥 Video ready</Text>
          <TouchableOpacity onPress={() => setVideo(null)}><Text style={{ color: '#f87171', fontSize: 12 }}>✕ Remove</Text></TouchableOpacity>
        </View>
      )}
      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoPreview}>
          {photos.map((uri, i) => (
            <View key={i} style={s.photoPreviewItem}>
              <Image source={{ uri }} style={s.photoPreviewImg} />
              <TouchableOpacity onPress={() => removePhoto(uri)} style={s.photoRemove}><Text style={{ color: '#fff', fontSize: 12 }}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={s.inputArea}>
        <View style={s.mediaButtons}>
          <TouchableOpacity onPress={takePhoto} style={s.mediaBtn}><Text style={s.mediaBtnTxt}>📷 Camera</Text></TouchableOpacity>
          <TouchableOpacity onPress={pickPhoto} style={s.mediaBtn}><Text style={s.mediaBtnTxt}>🖼 Gallery</Text></TouchableOpacity>
          <TouchableOpacity onPress={recordVideo} style={s.mediaBtn}><Text style={s.mediaBtnTxt}>🎥 Record</Text></TouchableOpacity>
          <TouchableOpacity onPress={pickVideo} style={s.mediaBtn}><Text style={s.mediaBtnTxt}>📁 Video</Text></TouchableOpacity>
        </View>
        <View style={s.inputRow}>
          <TextInput style={s.input} placeholder="Add diary entry..." placeholderTextColor={C.muted} value={text} onChangeText={setText} multiline maxLength={1000} />
          <TouchableOpacity style={[s.send, (loading || (!text.trim() && photos.length === 0)) && s.sendDisabled]} onPress={submit} disabled={loading || (!text.trim() && photos.length === 0)}>
            <Text style={s.sendTxt}>{uploading ? '⬆' : loading ? '...' : '→'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1923' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  back: { marginRight: 12, padding: 4 },
  backTxt: { color: '#00d4a0', fontSize: 22 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sub: { color: '#4d6478', fontSize: 12, marginTop: 2 },
  offlineBanner: { backgroundColor: '#fbbf2422', padding: 8, alignItems: 'center' },
  offlineTxt: { color: '#fbbf24', fontSize: 12 },
  entry: { backgroundColor: '#1a2635', borderRadius: 12, padding: 12, marginBottom: 10 },
  entryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 8 },
  badgeTxt: { fontSize: 10, fontWeight: '700' },
  entryTime: { color: '#4d6478', fontSize: 11 },
  entryText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  aiSummary: { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  photoThumb: { width: 80, height: 80, borderRadius: 8, marginRight: 8 },
  replyBox: { marginTop: 8, backgroundColor: 'rgba(0,212,160,0.08)', borderRadius: 8, padding: 8 },
  replyLabel: { color: '#00d4a0', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  replyText: { color: '#fff', fontSize: 13 },
  photoPreview: { maxHeight: 100, paddingHorizontal: 16, paddingVertical: 8 },
  photoPreviewItem: { position: 'relative', marginRight: 8 },
  photoPreviewImg: { width: 80, height: 80, borderRadius: 8 },
  photoRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  inputArea: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  mediaButtons: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  mediaBtn: { backgroundColor: '#1a2635', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  mediaBtnTxt: { color: '#00d4a0', fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, backgroundColor: '#1a2635', borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, maxHeight: 100 },
  send: { backgroundColor: '#00d4a0', borderRadius: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  sendTxt: { color: '#0f1923', fontSize: 20, fontWeight: '700' },
});