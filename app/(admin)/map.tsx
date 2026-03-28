import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, SafeAreaView, Platform } from "react-native";
import { authFetch } from "@/lib/api";

const C = { bg: "#0f1923", teal: "#00d4a0", muted: "#4d6478", text: "#ffffff", border: "rgba(255,255,255,0.05)" };

export default function MapScreen() {
  const [signins, setSignins] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  async function load() {
    try {
      const [sRes, jRes] = await Promise.all([authFetch("/api/admin/signins"), authFetch("/api/admin/jobs")]);
      const [s, j] = await Promise.all([sRes.json(), jRes.json()]);
      setSignins(s.signins || []);
      setJobs((j.jobs || []).filter((jb: any) => jb.lat && jb.lng));
    } catch {}
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Live Map</Text>
        <Text style={s.sub}>Map view available in native app</Text>
      </View>
      <View style={s.body}>
        <Text style={s.sectionTitle}>Currently on site ({signins.length})</Text>
        {signins.map(si => (
          <View key={si.id} style={s.row}>
            <View style={s.avatar}><Text style={s.avatarText}>{si.users?.initials || "?"}</Text></View>
            <View>
              <Text style={s.name}>{si.users?.name}</Text>
              <Text style={s.addr}>{si.jobs?.name}</Text>
            </View>
          </View>
        ))}
        {signins.length === 0 && <Text style={s.empty}>No one on site right now</Text>}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>Active job sites ({jobs.length})</Text>
        {jobs.map(j => (
          <View key={j.id} style={s.row}>
            <Text style={s.jobName}>{j.name}</Text>
            <Text style={s.addr}>{j.address}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 17, fontWeight: "600", color: C.text },
  sub: { fontSize: 12, color: C.muted, marginTop: 2 },
  body: { padding: 16 },
  sectionTitle: { fontSize: 13, color: C.muted, fontWeight: "600", marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,212,160,0.15)", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontWeight: "700", color: C.teal },
  name: { fontSize: 14, fontWeight: "500", color: C.text },
  jobName: { fontSize: 14, fontWeight: "500", color: C.text },
  addr: { fontSize: 12, color: C.muted },
  empty: { color: C.muted, fontSize: 14, paddingVertical: 12 },
});