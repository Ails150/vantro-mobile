import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch, authFormFetch } from '@/lib/api';

const C = { bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478', text: '#ffffff', border: 'rgba(255,255,255,0.05)', red: '#f87171', amber: '#fbbf24' };

export default function DefectsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const [defects, setDefects] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [photo, setPhoto] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await authFetch(`/api/defects?jobId=${id}`);
    const data = await res.json();
    setDefects(data.defects || []);
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function submit() {
    if (!description.trim()) return;
    setLoading(true);
    let photoUrl = '', photoPath = '';
    if (photo) {
      const form = new FormData();
      form.append('file', { uri: photo, type: 'image/jpeg', name: 'defect.jpg' } as any);
      form.append('jobId', id);
      form.append('itemId', 'defect');
      const upRes = await authFormFetch('/api/upload', form);
      if (upRes.ok) { const d = await upRes.json(); photoUrl = d.url; photoPath = d.path; }
    }
    await authFetch('/api/defects', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', jobId: id, description, severity, photoUrl, photoPath }),
    });
    setDescription(''); setPhoto(''); setSeverity('minor');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
    setLoading(false);
    load();
  }

  const severityColor = (s: string) => s === 'critical' ? C.red : s === 'major' ? C.amber : C.muted;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>â†</Text></TouchableOpacity>
        <View><Text style={s.title}>Defects</Text><Text style={s.subtitle}>{name}</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.sectionTitle}>Log a defect</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Describe the defect..." placeholderTextColor={C.muted} multiline numberOfLines={4} style={s.input} textAlignVertical="top" />
          <View style={s.severityRow}>
            {['minor','major','critical'].map(sev => (
              <TouchableOpacity key={sev} onPress={() => setSeverity(sev)} style={[s.severityBtn, severity === sev && s.severityBtnActive]}>
                <Text style={[s.severityText, { color: severityColor(sev) }, severity === sev && s.severityTextActive]}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {photo ? <Image source={{ uri: photo }} style={s.photoPreview} /> : null}
          <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
            <Text style={s.photoBtnText}>{photo ? 'Retake photo' : 'ðŸ“· Add photo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.submitBtn, (!description.trim() || loading) && s.submitBtnDisabled]} onPress={submit} disabled={!description.trim() || loading}>
            <Text style={s.submitBtnText}>{loading ? 'Submitting...' : success ? 'Logged! âœ“' : 'Log defect'}</Text>
          </TouchableOpacity>
        </View>

        {defects.length > 0 && (
          <>
            <Text style={s.prevTitle}>Previous defects</Text>
            {defects.map(d => (
              <View key={d.id} style={s.defectCard}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <Text style={[s.badge, { color: severityColor(d.severity), borderColor: severityColor(d.severity) }]}>{d.severity}</Text>
                  <Text style={[s.badge, { color: d.status === 'resolved' ? C.teal : C.red, borderColor: d.status === 'resolved' ? C.teal : C.red }]}>{d.status}</Text>
                </View>
                <Text style={s.defectDesc}>{d.description}</Text>
                {d.photo_url ? <Image source={{ uri: d.photo_url }} style={s.defectPhoto} /> : null}
                {d.resolution_note ? <Text style={s.resNote}>Resolution: {d.resolution_note}</Text> : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { fontSize: 22, color: C.muted },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  subtitle: { fontSize: 12, color: C.muted },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  input: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, color: C.text, fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: C.border },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  severityBtnActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  severityText: { fontSize: 13, fontWeight: '500' },
  severityTextActive: { fontWeight: '700' },
  photoPreview: { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
  photoBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  photoBtnText: { color: C.teal, fontSize: 14 },
  submitBtn: { backgroundColor: C.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#0f1923', fontWeight: '700', fontSize: 15 },
  prevTitle: { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 20, marginBottom: 10 },
  defectCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  badge: { fontSize: 12, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, fontWeight: '500' },
  defectDesc: { fontSize: 14, color: C.text },
  defectPhoto: { width: '100%', height: 130, borderRadius: 8, resizeMode: 'cover', marginTop: 8 },
  resNote: { fontSize: 12, color: C.muted, marginTop: 6 },
});
