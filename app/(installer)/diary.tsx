import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, AppState, Image, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch, authFormFetch } from '@/lib/api';
import { isOnline, queueAction, syncQueue } from '@/lib/offline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { listQueue, type WalkthroughQueueItem } from '@/lib/walktalk-queue';
import { tickUploader, manualRetry } from '@/lib/walktalk-uploader';
import ScreenHeader from '@/components/ScreenHeader';
import EmptyState from '@/components/EmptyState';
import { alpha, colors } from '@/theme';

const C = { bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted, text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red, amber: colors.amber };

export default function DiaryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = { bottom: 34 };
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pendingWorkStatus, setPendingWorkStatus] = useState<string|null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [offline, setOffline] = useState(false);
  const [windowDays, setWindowDays] = useState<number|null>(1); // 1=today, 7=week, 30=month, null=all
  const [hasMore, setHasMore] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [video, setVideo] = useState<string|null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [walktalkQueue, setWalktalkQueue] = useState<WalkthroughQueueItem[]>([]);
  const [walktalkExpanded, setWalktalkExpanded] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);
  const appState = useRef(AppState.currentState);
  const DIARY_CACHE_KEY = 'vantro_diary_' + id;

  const load = useCallback(async () => {
    const online = await isOnline();
    // Build since timestamp from windowDays (null = no filter, fetch all)
    let sinceParam = '';
    if (windowDays !== null) {
      const sinceDate = new Date();
      sinceDate.setHours(0, 0, 0, 0);
      sinceDate.setDate(sinceDate.getDate() - (windowDays - 1));
      sinceParam = '&since=' + encodeURIComponent(sinceDate.toISOString());
    }
    if (online) {
      try {
        await syncQueue(authFetch);
        const url = '/api/diary?jobId=' + id + '&limit=200' + sinceParam;
        console.log('[LOAD] GET', url);
        const res = await authFetch(url);
        console.log('[LOAD] status=', res?.status, 'ok=', res?.ok);
        if (res.ok) {
          const data = await res.json();
          const fetched = data.entries || [];
          console.log('[LOAD] count=', fetched.length, 'hasMore=', data.hasMore);
          setEntries(fetched);
          setHasMore(!!data.hasMore);
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
  }, [id, windowDays]);

  // Refresh walk & talk queue every 3s
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const items = await listQueue();
      setWalktalkQueue(items.filter(q => q.jobId === id));
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(interval); };
  }, [id]);

  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') await load();
      appState.current = next;
    });
    return () => sub.remove();
  }, [windowDays]);

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
  
    async function handleStatusTap(status: string | null) {
      setPendingWorkStatus(status);
      setShowStatusModal(false);
      doSubmit(status);
    }
  
    async function doSubmit(workStatusArg: any) {
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
        if (!online2) {
          Alert.alert('Need internet', 'Video uploads require an internet connection. Please connect and try again. Your text and photos are saved here.');
          setLoading(false); setUploading(false);
          return;
        }
        try { videoUrl = await uploadVideo(video); console.log('[DIARY] video uploaded result=', videoUrl); }
        catch (err) { console.log('[DIARY] video upload FAILED', err); }

        // CRITICAL: do not submit diary entry if video upload failed.
        // Otherwise we end up with a "Video entry" row with video_url = NULL.
        if (!videoUrl) {
          Alert.alert(
            'Video upload failed',
            'The video did not upload to the server. Please check your connection and try again. Your text and photos are still here.'
          );
          setLoading(false); setUploading(false);
          return;
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
            body: JSON.stringify({ jobId: id, entryText: text.trim() || (video ? 'Video entry' : 'Photo entry'), photoUrls, videoUrl, workStatus: workStatusArg })
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
        await queueAction({ type: 'diary', payload: { jobId: id, entryText: text.trim() || 'Photo entry', photoUrls, videoUrl } });
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
    <View style={s.safe}>
      <ScreenHeader title={name} subtitle="Site diary" onBack={() => router.back()} />
      <Modal visible={showStatusModal} transparent animationType='fade' onRequestClose={() => setShowStatusModal(false)}>
        <View style={{ flex: 1, backgroundColor: alpha(colors.black, 0.75), justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface1, borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 }}>Quick question</Text>
            <Text style={{ fontSize: 15, color: alpha(colors.textPrimary, 0.6), textAlign: 'center', marginBottom: 24 }}>Is work still going?</Text>

            <TouchableOpacity onPress={() => handleStatusTap('carrying_on')} style={{ backgroundColor: alpha(colors.teal, 0.12), borderWidth: 1, borderColor: alpha(colors.teal, 0.35), borderRadius: 12, padding: 16, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.teal }}>🟢 Yes, carrying on</Text>
              <Text style={{ fontSize: 13, color: alpha(colors.teal, 0.7), marginTop: 2 }}>Just logging this for the record</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleStatusTap('paused')} style={{ backgroundColor: alpha(colors.amber, 0.12), borderWidth: 1, borderColor: alpha(colors.amber, 0.35), borderRadius: 12, padding: 16, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.amber }}>🟡 Paused, sorting it</Text>
              <Text style={{ fontSize: 13, color: alpha(colors.amber, 0.7), marginTop: 2 }}>Under an hour, fix in motion</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleStatusTap('stopped')} style={{ backgroundColor: alpha(colors.red, 0.12), borderWidth: 1, borderColor: alpha(colors.red, 0.35), borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.red }}>🔴 Stopped, need help</Text>
              <Text style={{ fontSize: 13, color: alpha(colors.red, 0.7), marginTop: 2 }}>Admin and foreman alerted now</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowStatusModal(false)} style={{ padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: alpha(colors.textPrimary, 0.45) }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {offline && <View style={s.offlineBanner}><Text style={s.offlineTxt}>Offline, showing cached entries</Text></View>}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior='padding'>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
        {/* Date range filter pills */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Today', value: 1 },
            { label: '7d', value: 7 },
            { label: '30d', value: 30 },
            { label: 'All', value: null as number | null },
          ].map(opt => {
            const active = windowDays === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                onPress={() => setWindowDays(opt.value)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: active ? C.teal : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? C.teal : colors.surface3,
                }}
              >
                <Text style={{ color: active ? colors.base : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {(() => {
          const labelForDate = (d: Date) => {
            const today = new Date(); today.setHours(0,0,0,0);
            const y = new Date(today); y.setDate(y.getDate()-1);
            const tw = new Date(today); tw.setDate(tw.getDate()-2);
            const ds = new Date(d); ds.setHours(0,0,0,0);
            if (ds.getTime() === today.getTime()) return 'Today';
            if (ds.getTime() === y.getTime()) return 'Yesterday';
            if (ds.getTime() >= tw.getTime() - 5*86400000) {
              return d.toLocaleDateString('en-GB', { weekday: 'long' });
            }
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
          };
          const timeOnly = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

          // entries are oldest-first per server, but we want newest-first in the feed
          const ordered = [...entries].sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          if (ordered.length === 0) {
            const emptyTitle =
              windowDays === 1 ? 'No entries today'
              : windowDays === null ? 'No entries yet'
              : `No entries in the last ${windowDays} days`;
            return (
              <EmptyState
                icon="document-text-outline"
                title={emptyTitle}
                body="Snap a photo or hit Walk and Talk to log what happened on site."
              />
            );
          }

          const blocks: any[] = [];
          let lastLabel = '';
          for (const e of ordered) {
            const d = new Date(e.created_at);
            const label = labelForDate(d);
            if (label !== lastLabel) {
              blocks.push(
                <Text key={'hdr-' + label + '-' + e.id} style={s.dayHeader}>{label}</Text>
              );
              lastLabel = label;
            }
            if (e.kind === 'walktalk') {
              const expanded = !!walktalkExpanded[e.id];
              const themes = Array.isArray(e.ai_themes) ? e.ai_themes : [];
              const sentimentLabel = e.ai_sentiment ? e.ai_sentiment.toUpperCase() : null;
              const isAlert = e.ai_alert_type && e.ai_alert_type !== 'none';
              blocks.push(
                <TouchableOpacity
                  key={e.id}
                  activeOpacity={0.85}
                  onPress={() => setWalktalkExpanded(prev => ({ ...prev, [e.id]: !prev[e.id] }))}
                  style={[s.entry, { borderLeftWidth: 3, borderLeftColor: colors.purple }]}>
                  <View style={s.entryRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 16 }}>🎙</Text>
                      <View style={[s.badge, { backgroundColor: alpha(colors.purple, 0.13) }]}>
                        <Text style={[s.badgeTxt, { color: colors.purple }]}>WALK & TALK</Text>
                      </View>
                      {sentimentLabel && (
                        <View style={[s.badge, { backgroundColor: isAlert ? alpha(alertColor(e.ai_alert_type), 0.13) : colors.surface3 }]}>
                          <Text style={[s.badgeTxt, { color: isAlert ? alertColor(e.ai_alert_type) : colors.textSecondary }]}>{sentimentLabel}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.entryTime}>{timeOnly(d)}</Text>
                  </View>
                  <Text style={s.entryText}>{e.ai_summary || 'Walk & Talk recorded, analysis in progress.'}</Text>
                  {themes.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {themes.slice(0, 6).map((t: string, i: number) => (
                        <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.surface1, borderRadius: 6 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>#{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {expanded && Array.isArray(e.clips) && e.clips.length > 0 && (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      {e.clips.map((c: any, i: number) => (
                        <View key={i} style={{ backgroundColor: colors.base, borderRadius: 6, padding: 10 }}>
                          {c.transcript ? (
                            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{c.transcript}</Text>
                          ) : (
                            <Text style={{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic' }}>(no transcript yet)</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={{ color: colors.purple, fontSize: 11, marginTop: 6 }}>
                    {expanded ? 'Tap to collapse ↑' : 'Tap to view transcript ↓'}
                  </Text>
                </TouchableOpacity>
              );
            } else {
              blocks.push(
                <View key={e.id} style={[s.entry, e.ai_alert_type && e.ai_alert_type !== 'none' && { borderLeftWidth: 3, borderLeftColor: alertColor(e.ai_alert_type) }]}>
                  <View style={s.entryRow}>
                    {e.ai_alert_type && e.ai_alert_type !== 'none' && (
                      <View style={[s.badge, { backgroundColor: alpha(alertColor(e.ai_alert_type), 0.13) }]}>
                        <Text style={[s.badgeTxt, { color: alertColor(e.ai_alert_type) }]}>{e.ai_alert_type.toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={s.entryTime}>{timeOnly(d)}</Text>
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
              );
            }
          }
          return blocks;
        })()}
      </ScrollView>
      {video && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface1 }}>
          <Text style={{ color: colors.teal, fontSize: 13 }}>🎥 Video ready</Text>
          <TouchableOpacity onPress={() => setVideo(null)}><Text style={{ color: colors.red, fontSize: 12 }}>✕ Remove</Text></TouchableOpacity>
        </View>
      )}
      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoPreview}>
          {photos.map((uri, i) => (
            <View key={i} style={s.photoPreviewItem}>
              <Image source={{ uri }} style={s.photoPreviewImg} />
              <TouchableOpacity onPress={() => removePhoto(uri)} style={s.photoRemove}><Text style={{ color: colors.textPrimary, fontSize: 12 }}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={s.inputArea}>
        {walktalkQueue.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.purple, 0.08), borderColor: alpha(colors.purple, 0.27), borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, gap: 8 }}>
            <Text style={{ fontSize: 16 }}>🎙</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.purple, fontWeight: '700', fontSize: 13 }}>
                {walktalkQueue.filter(q => q.status === 'uploading').length > 0 ? 'Uploading walk & talk...' :
                 walktalkQueue.filter(q => q.status === 'failed').length === walktalkQueue.length ? `${walktalkQueue.length} failed, tap to retry` :
                 `${walktalkQueue.length} walk & talk${walktalkQueue.length === 1 ? '' : 's'} pending upload`}
              </Text>
              {walktalkQueue[0]?.lastError && (
                <Text style={{ color: colors.amber, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{walktalkQueue[0].lastError}</Text>
              )}
            </View>
            {walktalkQueue.some(q => q.status === 'failed') && (
              <TouchableOpacity onPress={() => walktalkQueue.filter(q => q.status === 'failed').forEach(q => manualRetry(q.id))} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.purple, borderRadius: 6 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
                <View style={s.mediaButtons}>
          <TouchableOpacity onPress={takePhoto} style={s.mediaBtn}><Text style={s.mediaBtnTxt}>{'\u{1F4F7} Camera'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={pickPhoto} style={s.mediaBtn}><Text style={s.mediaBtnTxt}>{'\u{1F5BC} Gallery'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(installer)/capture', params: { id, name: name || 'Site' } })} style={[s.mediaBtn, { backgroundColor: alpha(colors.purple, 0.13), borderColor: colors.purple }]}><Text style={[s.mediaBtnTxt, { color: colors.purple, fontWeight: '700' }]}>{'\u{1F399} Walk & Talk'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={pickVideo} style={s.mediaBtn}><Text style={s.mediaBtnTxt}>{'\u{1F39E} Video'}</Text></TouchableOpacity>
        </View>
        <View style={[s.inputRow, { marginBottom: insets.bottom }]}>
          <TextInput style={s.input} placeholder="Add diary entry..." placeholderTextColor={C.muted} value={text} onChangeText={setText} multiline maxLength={1000} />
          <TouchableOpacity style={[s.send, (loading || (!text.trim() && photos.length === 0 && !video)) && s.sendDisabled]} onPress={submit} disabled={loading || (!text.trim() && photos.length === 0 && !video)}>
            <Text style={s.sendTxt}>{uploading ? '⬆' : loading ? '...' : '→'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: alpha(colors.textPrimary, 0.05) },
  back: { marginRight: 12, padding: 4 },
  backTxt: { color: colors.teal, fontSize: 22 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  offlineBanner: { backgroundColor: alpha(colors.amber, 0.13), padding: 8, alignItems: 'center' },
  windowBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: alpha(colors.textPrimary, 0.02), borderBottomWidth: 1, borderBottomColor: alpha(colors.textPrimary, 0.05) },
  windowLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
  windowBtn: { color: colors.teal, fontSize: 12, fontWeight: '600' },
  offlineTxt: { color: colors.amber, fontSize: 12 },
  dayHeader: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4,
  },
  entry: { backgroundColor: colors.surface1, borderRadius: 12, padding: 12, marginBottom: 10 },
  entryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 8 },
  badgeTxt: { fontSize: 10, fontWeight: '700' },
  entryTime: { color: colors.textMuted, fontSize: 11 },
  entryText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  aiSummary: { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  photoThumb: { width: 80, height: 80, borderRadius: 8, marginRight: 8 },
  replyBox: { marginTop: 8, backgroundColor: alpha(colors.teal, 0.08), borderRadius: 8, padding: 8 },
  replyLabel: { color: colors.teal, fontSize: 10, fontWeight: '700', marginBottom: 2 },
  replyText: { color: colors.textPrimary, fontSize: 13 },
  photoPreview: { maxHeight: 100, paddingHorizontal: 16, paddingVertical: 8 },
  photoPreviewItem: { position: 'relative', marginRight: 8 },
  photoPreviewImg: { width: 80, height: 80, borderRadius: 8 },
  photoRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: alpha(colors.black, 0.7), borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  inputArea: { borderTopWidth: 1, borderTopColor: alpha(colors.textPrimary, 0.05), paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  mediaButtons: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  mediaBtn: { backgroundColor: colors.surface1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  mediaBtnTxt: { color: colors.teal, fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, backgroundColor: colors.surface1, borderRadius: 12, padding: 12, color: colors.textPrimary, fontSize: 14, maxHeight: 100 },
  send: { backgroundColor: colors.teal, borderRadius: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  sendTxt: { color: colors.base, fontSize: 20, fontWeight: '700' },
});
