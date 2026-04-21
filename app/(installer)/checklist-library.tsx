import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function ChecklistLibraryScreen() {
  const { jobId, jobName } = useLocalSearchParams<{ jobId: string; jobName: string }>();
  const router = useRouter();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string|null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const res = await authFetch('/api/checklist?action=list_templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function startChecklist(templateId: string, templateName: string) {
    setStarting(templateId);
    try {
      const res = await authFetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_to_job', jobId, templateId })
      });
      if (res.ok) {
        router.replace({ pathname: '/(installer)/checklist', params: { jobId, jobName, templateId, templateName } });
      }
    } catch (e) { console.error(e); }
    setStarting(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><Text style={s.backTxt}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Checklist Library</Text>
          <Text style={s.sub} numberOfLines={1}>{jobName}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.sectionLabel}>Select a checklist to complete</Text>
        {loading && <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />}
        {!loading && templates.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No checklists available.</Text>
            <Text style={s.emptySubTxt}>Ask your admin to create checklist templates.</Text>
          </View>
        )}
        {templates.map((t: any) => (
          <TouchableOpacity key={t.id} style={s.card} onPress={() => startChecklist(t.id, t.name)} disabled={starting === t.id}>
            <View style={s.cardLeft}>
              <Text style={s.cardTitle}>{t.name}</Text>
              <Text style={s.cardSub}>{t.item_count || 0} items{t.frequency ? ' · ' + t.frequency : ''}</Text>
            </View>
            {starting === t.id
              ? <ActivityIndicator color={C.teal} />
              : <Text style={s.cardArrow}>→</Text>
            }
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  sectionLabel: { color: '#4d6478', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  card: { backgroundColor: '#1a2635', borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  cardLeft: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardSub: { color: '#4d6478', fontSize: 13, marginTop: 4 },
  cardArrow: { color: '#00d4a0', fontSize: 20, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptySubTxt: { color: '#4d6478', fontSize: 13, marginTop: 8, textAlign: 'center' },
});