import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { authFetch } from '@/lib/api';
import ScreenHeader from '@/components/ScreenHeader';
import { alpha, colors } from '@/theme';

const C = { bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted, text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red, amber: colors.amber };

const statusColor = (s: string) => s === 'active' ? C.teal : s === 'on_hold' ? C.amber : C.muted;

export default function AdminJobsScreen() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState('active');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await authFetch('/api/admin/jobs');
    if (res.ok) { const d = await res.json(); setJobs(d.jobs || []); }
    setRefreshing(false);
  }

  const filters = ['active', 'on_hold', 'completed', 'all'];
  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <View style={s.safe}>
      <ScreenHeader title="Jobs" />
      <View style={s.filterRow}>
        {filters.map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[s.filterBtn, filter === f && s.filterBtnActive]}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f === 'on_hold' ? 'On Hold' : f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.teal} />} contentContainerStyle={s.scroll}>
        {filtered.length === 0 && <Text style={s.empty}>No jobs</Text>}
        {filtered.map(job => (
          <View key={job.id} style={s.card}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.jobName}>{job.name}</Text>
                <Text style={s.jobAddr}>{job.address}</Text>
              </View>
              <Text style={[s.statusBadge, { color: statusColor(job.status) }]}>{job.status}</Text>
            </View>
            {job.checklist_template_id && <Text style={s.checklistTag}>Checklist attached</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: alpha(colors.textPrimary, 0.04), borderWidth: 1, borderColor: C.border },
  filterBtnActive: { backgroundColor: C.teal, borderColor: C.teal },
  filterText: { fontSize: 13, color: C.muted },
  filterTextActive: { color: colors.base, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  jobName: { fontSize: 15, fontWeight: '600', color: C.text },
  jobAddr: { fontSize: 13, color: C.muted, marginTop: 2 },
  statusBadge: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  checklistTag: { fontSize: 12, color: C.teal, marginTop: 8 },
});
