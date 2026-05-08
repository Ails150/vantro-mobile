import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { authFetch } from "@/lib/api";

const C = { bg: "#0f1923", card: "#1a2635", teal: "#00d4a0", purple: "#BC6AFF", muted: "#4d6478", text: "#ffffff", red: "#f87171", amber: "#fbbf24" };

const MIN_SECONDS = 10;
const MAX_SECONDS = 120;

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ id: string; name: string }>();
  const { id, name } = params;
  const router = useRouter();
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      if (!camPerm?.granted) await requestCamPerm();
      if (!micPerm?.granted) await requestMicPerm();
    })();
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function startRecord() {
    if (!cameraRef.current) return;
    if (!camPerm?.granted || !micPerm?.granted) {
      Alert.alert("Permissions needed", "Camera and microphone access required.");
      return;
    }
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s + 1 >= MAX_SECONDS) { stopRecord(); return MAX_SECONDS; }
        return s + 1;
      });
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_SECONDS });
      if (video?.uri) {
        await uploadAndSave(video.uri);
      }
    } catch (e) {
      console.error("Record error:", e);
      Alert.alert("Recording failed", "Please try again.");
      setRecording(false);
    }
  }

  async function stopRecord() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (cameraRef.current && recording) {
      setRecording(false);
      if (seconds < MIN_SECONDS) {
        Alert.alert("Too short", `Walkthrough must be at least ${MIN_SECONDS} seconds. Please start again.`);
        cameraRef.current.stopRecording();
        setSeconds(0);
        return;
      }
      cameraRef.current.stopRecording();
    }
  }

  async function uploadAndSave(uri: string) {
    setUploading(true);
    try {
      let lat: number | null = null, lng: number | null = null;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {}

      console.log("[VOICE] getting upload URL");
      const urlRes = await authFetch("/api/stream/upload-url", { method: "POST" });
      if (!urlRes.ok) throw new Error("Upload URL request failed");
      const { uploadURL, uid, playbackUrl } = await urlRes.json();
      console.log("[VOICE] got uid=", uid);

      const formData = new FormData();
      formData.append("file", { uri, name: `voice_${Date.now()}.mp4`, type: "video/mp4" } as any);
      console.log("[VOICE] uploading to Cloudflare");
      const cfRes = await fetch(uploadURL, { method: "POST", body: formData });
      console.log("[VOICE] direct upload status=", cfRes?.status);
      if (!cfRes.ok) throw new Error("Stream upload failed");

      console.log("[VOICE] triggering AI processing");
      setUploading(false);
      setProcessing(true);

      const saveRes = await authFetch("/api/walkthroughs/upload-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: id,
          streamUid: uid,
          playbackUrl,
          durationSeconds: seconds,
          lat,
          lng,
        })
      });

      if (!saveRes.ok) {
        const errBody = await saveRes.json().catch(() => ({}));
        if (errBody.capReached) {
          Alert.alert("Limit reached", errBody.message || "You have used your 5 walkthroughs this month.");
          router.back();
          return;
        }
        throw new Error(errBody.error || "Save failed");
      }

      console.log("[VOICE] SUCCESS");
      setDone(true);
      setTimeout(() => router.back(), 2000);
    } catch (e: any) {
      console.error("Upload error:", e);
      Alert.alert("Upload failed", e.message || "Please try again.");
    }
    setUploading(false);
    setProcessing(false);
  }

  if (!camPerm || !micPerm) {
    return <SafeAreaView style={s.safe}><ActivityIndicator color={C.teal} /></SafeAreaView>;
  }

  if (!camPerm.granted || !micPerm.granted) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.permBox}>
          <Text style={s.permTitle}>Camera access needed</Text>
          <Text style={s.permText}>Vantro needs camera and microphone access to record voice walkthroughs.</Text>
          <TouchableOpacity style={s.permBtn} onPress={async () => { await requestCamPerm(); await requestMicPerm(); }}>
            <Text style={s.permBtnTxt}>Grant access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.doneBox}>
          <Text style={s.doneIcon}>✓</Text>
          <Text style={s.doneTitle}>Walkthrough saved</Text>
          <Text style={s.sub}>AI is analysing now. Check the admin tab in a moment.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (processing) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.doneBox}>
          <ActivityIndicator color={C.purple} size="large" />
          <Text style={s.doneTitle}>Analysing your walkthrough…</Text>
          <Text style={s.sub}>Transcribing and structuring with AI</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (uploading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.doneBox}>
          <ActivityIndicator color={C.teal} size="large" />
          <Text style={s.doneTitle}>Uploading…</Text>
          <Text style={s.sub}>{seconds}s recorded</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backTxt}>← Cancel</Text>
        </TouchableOpacity>
        <View style={[s.stageBadge, { backgroundColor: C.purple + "22", borderColor: C.purple }]}>
          <Text style={[s.stageTxt, { color: C.purple }]}>WALK & TALK</Text>
        </View>
      </View>
      <Text style={s.jobName}>{name}</Text>
      <Text style={s.sub}>Walk through the site and narrate what you see. AI will structure it into a report. Min {MIN_SECONDS}s · Max {MAX_SECONDS}s</Text>
      <View style={s.cameraWrap}>
        <CameraView ref={cameraRef} style={s.camera} mode="video" facing="back" />
        {recording && (
          <View style={s.timerPill}>
            <View style={s.recDot} />
            <Text style={s.timerTxt}>{seconds}s</Text>
          </View>
        )}
        {!recording && (
          <View style={s.tipPill}>
            <Text style={s.tipTxt}>💡 Tip: Show what you say. Take your time.</Text>
          </View>
        )}
      </View>
      <View style={s.controls}>
        {!recording ? (
          <TouchableOpacity style={[s.recordBtn, { backgroundColor: C.purple }]} onPress={startRecord}>
            <Text style={s.recordBtnTxt}>● START WALKTHROUGH</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.recordBtn, { backgroundColor: C.red, opacity: seconds < MIN_SECONDS ? 0.5 : 1 }]} onPress={stopRecord} disabled={seconds < MIN_SECONDS}>
            <Text style={s.recordBtnTxt}>■ DONE {seconds < MIN_SECONDS ? `(${MIN_SECONDS - seconds}s more)` : ""}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  back: { padding: 4 },
  backTxt: { color: C.teal, fontSize: 16 },
  stageBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  stageTxt: { fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  jobName: { color: C.text, fontSize: 18, fontWeight: "700", paddingHorizontal: 16 },
  sub: { color: C.muted, fontSize: 12, paddingHorizontal: 16, marginTop: 4 },
  cameraWrap: { flex: 1, margin: 16, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" },
  camera: { flex: 1 },
  timerPill: { position: "absolute", top: 16, left: 16, backgroundColor: "rgba(0,0,0,0.7)", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 6 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  timerTxt: { color: "#fff", fontWeight: "700" },
  tipPill: { position: "absolute", bottom: 16, left: 16, right: 16, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  tipTxt: { color: "#fff", fontSize: 13, textAlign: "center" },
  controls: { padding: 16, paddingBottom: 32 },
  recordBtn: { paddingVertical: 18, borderRadius: 16, alignItems: "center" },
  recordBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  permBox: { flex: 1, justifyContent: "center", padding: 24 },
  permTitle: { color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 12 },
  permText: { color: C.muted, fontSize: 14, marginBottom: 24 },
  permBtn: { backgroundColor: C.teal, padding: 16, borderRadius: 12, alignItems: "center" },
  permBtnTxt: { color: "#0f1923", fontWeight: "700" },
  doneBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  doneIcon: { fontSize: 64, color: C.teal, marginBottom: 16 },
  doneTitle: { color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
});
