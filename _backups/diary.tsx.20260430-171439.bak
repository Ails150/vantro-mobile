import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, AppState, Image, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch, authFormFetch } from '@/lib/api';
import { isOnline, queueAction, syncQueue } from '@/lib/offline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function DiaryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = { bottom: 34 };
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pendingWorkStatus, setPendingWorkStatus] = useState(null);
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
        console.log('[LOAD] GET jobId=' + id);
        const res = await authFetch('/api/diary?jobId=' + id);
        console.log('[LOAD] status=', res?.status, 'ok=', res?.ok);
        if (res.ok) {
          const data = await res.json();
          console.log('[LOAD] data=', JSON.stringify(data).substring(0, 300));
          const fetched = data.entries || [];
          console.log('[LOAD] count=', fetched.length);
          setEntries(fetched);
          await AsyncStorage.setItem(DIARY_CACHE_KEY, JSON.stringify(fetched));
          setOffline(false);
        } else {
          const body = await res.text().catch(() => 'no body');
          console.log('[LOAD] FAILED body=', body);
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
        const res = await authFormFetch('/api/upload', formData);
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
      console.log('[VIDEO] upload START uri=', uri);

      // Step 1: Get one-time upload URL from our API (tiny request, no body size issue)
      const urlRes = await authFetch('/api/stream/upload-url', { method: 'POST' });
      console.log('[VIDEO] upload-url status=', urlRes?.status);
      if (!urlRes.ok) {
        const body = await urlRes.text().catch(() => 'no body');
        console.log('[VIDEO] upload-url FAILED body=', body);
        return null;
      }
      const { uploadURL, embedUrl } = await urlRes.json();
      console.log('[VIDEO] got uploadURL, uid embedUrl=', embedUrl);

      // Step 2: Upload video directly to Cloudflare (bypasses Vercel 4.5MB limit)
      const filename = 'diary_video_' + Date.now() + '.mp4';
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type: 'video/mp4' } as any);
      const cfRes = await fetch(uploadURL, { method: 'POST', body: formData });
      console.log('[VIDEO] direct upload status=', cfRes?.status, 'ok=', cfRes?.ok);

      if (!cfRes.ok) {
        const body = await cfRes.text().catch(() => 'no body');
        console.log('[VIDEO] direct upload FAILED body=', body);
        return null;
      }

      console.log('[VIDEO] upload SUCCESS embedUrl=', embedUrl);
      return embedUrl;
    } catch (e) { console.error('[VIDEO] upload exception:', e); }
    return null;
  }

  async function submit() {
      if (!text.trim() && photos.length === 0 && !video) {
        Alert.alert('Empty', 'Add a note, photo or video first');
        return;
      }
      setShowStatusModal(true);
    }
  
    async function handleStatusTap(status) {
      setPendingWorkStatus(status);
      setShowStatusModal(false);
      setTimeout(() => { doSubmit(); }, 50);
    }
  
    async function doSubmit() {
    console.log('[DIARY] submit START text=', text, 'photos=', photos.length, 'video=', !!video);
    if (!text.trim() && photos.length === 0 && !video) { console.log('[DIARY] early return - empty'); return; }
    setLoading(true);
    setUploading(photos.length > 0);
    try {
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        console.log('[DIARY] checking online for photo upload');
        const online = await isOnline();
        console.log('[DIARY] online=', online);
        if (online) {
          try { photoUrls = await uploadPhotos(photos); console.log('[DIARY] uploaded photos', photoUrls); }
          catch (err) { console.log('[DIARY] photo upload FAILED', err); }
        }
      }

      let videoUrl: string | null = null;
      if (video) {
        console.log('[DIARY] uploading video');
        const online2 = await isOnline();
        if (online2) {
          try { videoUrl = await uploadVideo(video); console.log('[DIARY] video uploaded result=', videoUrl); }
          catch (err) { console.log('[DIARY] video upload FAILED', err); }
        }
      }

      setUploading(false);
      console.log('[DIARY] checking online for POST');
      const online = await isOnline();
      console.log('[DIARY] POST online=', online);
      if (online) {
        console.log('[DIARY] calling authFetch /api/diary');
        let res: any;
        try {
          res = await authFetch('/api/diary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: id, entryText: text.trim() || (video ? 'Video entry' : 'Photo entry'), photoUrls, videoUrl, workStatus: pendingWorkStatus })
          });
          console.log('[DIARY] authFetch returned status=', res?.status, 'ok=', res?.ok);
        } catch (fetchErr: any) {
          console.log('[DIARY] authFetch THREW:', fetchErr?.message || String(fetchErr));
          Alert.alert('Fetch error', fetchErr?.message || 'network');
          setLoading(false); setUploading(false);
          return;
        }
        if (!res?.ok) {
          const body = await res.text().catch(() => 'no body');
          console.log('[DIARY] response NOT OK body=', body);
          Alert.alert('Server error', 'status ' + res?.status + ': ' + String(body).substring(0, 100));
        }
        if (res.ok) {
          setText('');
          setPhotos([]);
          setVideo(null);
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
      <Modal visible={showStatusModal} transparent animationType='fade' onRequestClose={() => setShowStatusModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a2635', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 6 }}>Quick question</Text>
            <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24 }}>Is work still going?</Text>

            <TouchableOpacity onPress={() => handleStatusTap('carrying_on')} style={{ backgroundColor: 'rgba(0,212,160,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,160,0.35)', borderRadius: 12, padding: 16, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#00d4a0' }}>🟢 Yes, carrying on</Text>
              <Text style={{ fontSize: 13, color: 'rgba(0,212,160,0.7)', marginTop: 2 }}>Just logging this for the record</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleStatusTap('paused')} style={{ backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)', borderRadius: 12, padding: 16, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fbbf24' }}>🟡 Paused, sorting it</Text>
              <Text style={{ fontSize: 13, color: 'rgba(251,191,36,0.7)', marginTop: 2 }}>Under an hour, fix in motion</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleStatusTap('stopped')} style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#ef4444' }}>🔴 Stopped — need help</Text>
              <Text style={{ fontSize: 13, color: 'rgba(239,68,68,0.7)', marginTop: 2 }}>Admin and foreman alerted now</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowStatusModal(false)} style={{ padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
              <Text style={s.entryTime}>{(() => { const d = new Date(e.created_at); const t = new Date(); const y = new Date(); y.setDate(y.getDate()-1); const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); if (d.toDateString() === t.toDateString()) return time; if (d.toDateString() === y.toDateString()) return 'Yest ' + time; return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + time; })()}</Text>
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
        <View style={[s.inputRow, { marginBottom: insets.bottom }]}>
          <TextInput style={s.input} placeholder="Add diary entry..." placeholderTextColor={C.muted} value={text} onChangeText={setText} multiline maxLength={1000} />
          <TouchableOpacity style={[s.send, (loading || (!text.trim() && photos.length === 0 && !video)) && s.sendDisabled]} onPress={submit} disabled={loading || (!text.trim() && photos.length === 0 && !video)}>
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