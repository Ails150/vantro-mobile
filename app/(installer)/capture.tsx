import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Dimensions, SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const C = {
  bg: '#0f1923', card: '#1a2635', accent: '#00d4a0',
  purple: '#BC6AFF', muted: '#4d6478', danger: '#ff3b30',
};

export default function CaptureScreen() {
  const { id: jobId, name: jobName } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobAddress, setJobAddress] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('jobs').select('company_id, address').eq('id', jobId).single();
      if (error || !data) { Alert.alert('Error', 'Could not load job'); router.back(); return; }
      setCompanyId(data.company_id);
      setJobAddress(data.address);
    })();
  }, [jobId]);

  useEffect(() => {
    if (!isRecording) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [isRecording]);

  const ensurePermissions = async () => {
    if (!cameraPermission?.granted) { const r = await requestCameraPermission(); if (!r.granted) return false; }
    if (!micPermission?.granted) { const r = await requestMicPermission(); if (!r.granted) return false; }
    const loc = await Location.requestForegroundPermissionsAsync();
    if (!loc.granted) return false;
    return true;
  };

  const startRecording = async () => {
    const ok = await ensurePermissions();
    if (!ok) { Alert.alert('Permissions needed', 'Camera, microphone and location required.'); return; }
    if (!cameraRef.current) return;
    setIsRecording(true); setElapsed(0);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 * 20 });
      if (video?.uri) await handleUpload(video.uri);
    } catch (err) { console.error(err); Alert.alert('Recording failed', String(err));
    } finally { setIsRecording(false); }
  };

  const stopRecording = () => {
    if (!cameraRef.current || !isRecording) return;
    cameraRef.current.stopRecording();
  };

  const handleUpload = async (localUri: string) => {
    if (!companyId) return;
    setIsUploading(true);
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const capturedAt = new Date().toISOString();
      const info = await FileSystem.getInfoAsync(localUri);
      const fileSize = info.exists ? info.size : 0;
      const captureSource = SCREEN_W < 500 && SCREEN_H < 500 ? 'smart_glasses' : 'phone';
      const storagePath = `${companyId}/${jobId}/${Date.now()}.mp4`;

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('Not signed in');

      const fileBody = { uri: localUri, name: 'capture.mp4', type: 'video/mp4' } as any;
      const { error: uploadErr } = await supabase.storage
        .from('job-videos').upload(storagePath, fileBody, { contentType: 'video/mp4', upsert: false });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from('job_videos').insert({
        job_id: jobId, uploaded_by: userId, storage_path: storagePath,
        duration_seconds: elapsed, file_size_bytes: fileSize, capture_source: captureSource,
        capture_lat: loc.coords.latitude, capture_lng: loc.coords.longitude,
        captured_at: capturedAt, status: 'pending',
      });
      if (insertErr) throw insertErr;

      await FileSystem.deleteAsync(localUri, { idempotent: true });
      Alert.alert('Uploaded', 'Walkthrough uploaded. AI report will appear in the admin dashboard shortly.');
      router.back();
    } catch (err: any) {
      console.error(err); Alert.alert('Upload failed', err?.message ?? 'Unknown error');
    } finally { setIsUploading(false); }
  };

  if (!companyId) return (
    <SafeAreaView style={s.loading}><ActivityIndicator size="large" color={C.accent} /></SafeAreaView>
  );

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={s.camera} mode="video" facing="back" />
      <SafeAreaView style={s.overlay}>
        <View style={s.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <View style={s.banner}>
            <Text style={s.bannerLabel}>JOB</Text>
            <Text style={s.bannerValue} numberOfLines={1}>{jobName}</Text>
            {jobAddress ? <Text style={s.bannerAddress} numberOfLines={1}>{jobAddress}</Text> : null}
          </View>
        </View>
        {isRecording && (
          <View style={s.timer}>
            <View style={s.recDot} />
            <Text style={s.timerText}>{formatElapsed(elapsed)}</Text>
          </View>
        )}
        <View style={s.controls}>
          {isUploading ? (
            <View style={s.uploadingBox}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={s.uploadingText}>Uploading…</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={isRecording ? stopRecording : startRecording}
              style={[s.recordButton, isRecording && s.recordButtonActive]}>
              <Text style={s.recordButtonText}>{isRecording ? 'STOP' : 'RECORD'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 44, height: 44, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  backTxt: { color: C.accent, fontSize: 22 },
  banner: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 12 },
  bannerLabel: { color: C.purple, fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  bannerValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bannerAddress: { color: '#ccc', fontSize: 12, marginTop: 2 },
  timer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger, marginRight: 8 },
  timerText: { color: '#fff', fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '600' },
  controls: { alignItems: 'center', paddingBottom: 20 },
  recordButton: { width: 110, height: 110, borderRadius: 55, backgroundColor: C.purple,
    justifyContent: 'center', alignItems: 'center', borderWidth: 6, borderColor: '#fff' },
  recordButtonActive: { backgroundColor: C.danger },
  recordButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  uploadingBox: { alignItems: 'center' },
  uploadingText: { color: '#fff', marginTop: 10, fontSize: 16 },
});