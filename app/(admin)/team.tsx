import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { authFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

const roleColor = (r: string) => r === 'admin' ? '#a78bfa' : r === 'foreman' ? '#60a5fa' : C.muted;

export default function TeamScreen() {
  const [members, setMembers] = useState<any[]>([]);
  const [signins, setSignins] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [mRes, sRes] = await Promise.all([authFetch('/api/admin/team'), authFetch('/api/admin/signins')]);
    if (mRes.ok) { const d = await mRes.json(); setMembers(d.members || []); }
    if (sRes.ok) { const d = await sRes.json(); setSignins(d.signins || []); }
    setRefreshing(false);
  }

  const onSiteIds = new Set(signins.map((s: any) => s.user_id));

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Team</Text><Text style={s.sub}>{members.length} members</Text></View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.teal} />} contentContainerStyle={s.scroll}>
        {members.map(m => {
          const onSite = onSiteIds.has(m.id);
          return (
            <View key={m.id} style={[s.card, m.is_active === false && s.cardInactive]}>
              <View style={s.avatarWrap}>
                <Text style={s.avatarText}>{m.initials}</Text>
                {onSite && <View style={s.onlineDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{m.name}</Text>
                <Text style={s.email}>{m.email || 'No email'}</Text>
                {m.is_active === false && <Text style={s.suspended}>Suspended</Text>}
                {!m.pin_hash && m.role === 'installer' && <Text style={s.noPIN}>PIN not set</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.roleBadge, { color: roleColor(m.role) }]}>{m.role}</Text>
                {onSite && <Text style={s.onSiteText}>On site</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  sub: { fontSize: 13, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardInactive: { opacity: 0.5 },
  avatarWrap: { position: 'relative' },
  avatarText: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', textAlign: 'center', textAlignVertical: 'center', fontSize: 15, fontWeight: '600', color: C.text, lineHeight: 44 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal, borderWidth: 2, borderColor: C.card },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  email: { fontSize: 12, color: C.muted },
  suspended: { fontSize: 11, color: C.amber, marginTop: 2 },
  noPIN: { fontSize: 11, color: C.red, marginTop: 2 },
  roleBadge: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  onSiteText: { fontSize: 11, color: C.teal },
});
