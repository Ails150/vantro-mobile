import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addToQueue } from "@/lib/walktalk-queue";
import { tickUploader } from "@/lib/walktalk-uploader";

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
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<any>(null);
  const finalSecondsRef = useRef<number>(0);

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
        await saveLocally(video.uri);
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
      finalSecondsRef.current = seconds;
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

  async function saveLocally(uri: string) {
    setSaving(true);
    try {
      // Capture GPS (best effort, non-blocking)
      let lat: number | null = null, lng: number | null = null;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {}

      const duration = finalSecondsRef.current || seconds;

      // Save to local queue — instant, works offline
      console.log("[CAPTURE] saving to local queue, duration=", duration);
      await addToQueue({
        jobId: id || "",
        jobName: name || "Site",
        sourceUri: uri,
        durationSeconds: duration,
        lat,
        lng,
      });

      // Kick the uploader (will run in background, non-blocking)
      tickUploader().catch(e => console.warn("[CAPTURE] uploader kick failed:", e));

      setDone(true);
      setTimeout(() => router.back(), 1500);
    } catch (e: any) {
      console.error("Save error:", e);
      Alert.alert("Save failed", e.message || "Please try again.");
      setSaving(false);
    }
  }

  if (!camPerm || !micPerm) {
    return <SafeAreaView style={s.safe}><ActivityIndicator color={C.teal} /></SafeAreaView>;
  }

  if (!camPerm.granted || !micPerm.granted) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.permBox}>
          <Text style={s.permEmoji}>🎙</Text>
          <Text style={s.permTitle}>Record a Walk & Talk</Text>
          <Text style={s.permText}>Walk through the site and describe what you see. Vantro AI structures your voice into an audit-ready record with summary, themes, and timestamps.</Text>
          <Text style={s.permSubText}>We only access the camera and microphone while you're recording. You can revoke access anytime in your phone settings.</Text>
          <TouchableOpacity style={s.permBtn} onPress={async () => { await requestCamPerm(); await requestMicPerm(); }}>
            <Text style={s.permBtnTxt}>Allow camera & microphone</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.permBtnGhost} onPress={() => router.back()}>
            <Text style={s.permBtnGhostTxt}>Maybe later</Text>
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
          <Text style={s.doneTitle}>Walk & Talk saved</Text>
          <Text style={s.sub}>Stored on this phone. Will upload automatically when online.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (saving) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.doneBox}>
          <ActivityIndicator color={C.purple} size="large" />
          <Text style={s.doneTitle}>Saving locally…</Text>
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
            <Text style={s.tipTxt}>💡 Saved on phone first — uploads when online. No data lost.</Text>
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
  permBox: { flex: 1, justifyContent: "center", paddingHorizontal: 32, alignItems: "center" },
  permEmoji: { fontSize: 56, marginBottom: 18, textAlign: "center" },
  permTitle: { color: C.text, fontSize: 24, fontWeight: "700", marginBottom: 14, textAlign: "center", letterSpacing: -0.5 },
  permText: { color: C.text, fontSize: 15, lineHeight: 22, marginBottom: 12, textAlign: "center", opacity: 0.85 },
  permSubText: { color: C.muted, fontSize: 13, lineHeight: 19, marginBottom: 28, textAlign: "center" },
  permBtn: { backgroundColor: C.purple, paddingVertical: 16, paddingHorizontal: 28, borderRadius: 14, width: "100%", marginBottom: 10 },
  permBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" },
  permBtnGhost: { paddingVertical: 14, paddingHorizontal: 28, width: "100%" },
  permBtnGhostTxt: { color: C.muted, fontSize: 14, fontWeight: "500", textAlign: "center" },
  doneBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  doneIcon: { fontSize: 64, color: C.teal, marginBottom: 16 },
  doneTitle: { color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
});
