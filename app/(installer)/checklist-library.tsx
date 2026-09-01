import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '@/lib/api';
import ScreenHeader from '@/components/ScreenHeader';
import { alpha, colors } from '@/theme';

const CHECKLIST_LIB_CACHE_KEY = 'vantro_checklist_library_cache';

const C = { bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted, text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red, amber: colors.amber };

export default function ChecklistLibraryScreen() {
  const { jobId, jobName } = useLocalSearchParams<{ jobId: string; jobName: string }>();
  const router = useRouter();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string|null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const cacheKey = CHECKLIST_LIB_CACHE_KEY + '_' + jobId;
    // Hydrate from cache first
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setTemplates(JSON.parse(cached));
        setLoading(false);
      }
    } catch {}
    // Then fetch fresh
    try {
      const res = await authFetch('/api/installer/checklists/library?jobId=' + jobId);
      if (res.ok) {
        const data = await res.json();
        const fetched = data.library || [];
        setTemplates(fetched);
        setOffline(false);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(fetched));
      } else {
        setOffline(true);
      }
    } catch (e) {
      console.log('[CHECKLIST-LIB] load failed, using cache', e);
      setOffline(true);
    }
    setLoading(false);
  }

  function startChecklist(templateId: string, templateName: string) {
    setStarting(templateId);
    router.replace({ pathname: '/(installer)/checklist-run' as any, params: { jobId, jobName, templateId, templateName } });
  }

  return (
    <View style={s.safe}>
      <ScreenHeader title="Checklist library" subtitle={jobName} onBack={() => router.back()} />
      {offline && <View style={s.offlineBanner}><Text style={s.offlineTxt}>{'Offline \u2014 showing cached checklists'}</Text></View>}
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
              <Text style={s.cardSub}>{(t.items || []).length} items{t.frequency ? ' · ' + t.frequency : ''}</Text>
            </View>
            {starting === t.id
              ? <ActivityIndicator color={C.teal} />
              : <Text style={s.cardArrow}>→</Text>
            }
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  card: { backgroundColor: colors.surface1, borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  cardLeft: { flex: 1 },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  cardSub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  cardArrow: { color: colors.teal, fontSize: 20, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyTxt: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  emptySubTxt: { color: colors.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' },
  offlineBanner: { backgroundColor: alpha(colors.amber, 0.12), borderColor: colors.amber, borderWidth: 1, marginHorizontal: 16, marginTop: 12, borderRadius: 8, padding: 10 },
  offlineTxt: { color: colors.amber, fontSize: 12, fontWeight: '500' },
});