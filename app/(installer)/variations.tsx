import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch, authFormFetch } from '@/lib/api';
import ScreenHeader from '@/components/ScreenHeader';
import PrimaryButton from '@/components/PrimaryButton';
import EmptyState from '@/components/EmptyState';
import { alpha, colors, space, type } from '@/theme';

// Raise a variation or a daywork from site.
//
// The only required field is what changed. Hours, materials, cost and photos
// are optional because the person standing there does not always know them --
// but a variation raised now with one line and a photo beats a perfect one
// written up on Friday from memory, which is the one the main contractor
// disputes. The office prices it and sends it for signature.

const C = {
  bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted,
  text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), amber: colors.amber, red: colors.red,
};

const KINDS = [
  { label: 'Variation', value: 'variation', hint: 'Work that changed from the drawings or the order' },
  { label: 'Daywork', value: 'daywork', hint: 'Extra work charged on time and materials' },
] as const;

const MAX_PHOTOS = 6;

export default function VariationsScreen() {
  const { id: jobId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();

  const [kind, setKind] = useState<string>('variation');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [materials, setMaterials] = useState('');
  const [cost, setCost] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<any[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/installer/variations?jobId=${jobId}`);
      const data = await res.json();
      if (res.ok) {
        setAvailable(data.available !== false);
        setExisting(data.variations || []);
      }
    } catch { /* offline: the form still shows, the list does not load */ }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function addPhoto(source: 'camera' | 'library') {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Enough photos', `Up to ${MAX_PHOTOS} on one variation.`);
      return;
    }
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Camera needed', 'Allow camera access to add a photo.');
        return;
      }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotos(p => [...p, result.assets[0].uri]);
    }
  }

  async function submit() {
    if (!description.trim()) {
      Alert.alert('Say what changed', 'One line is enough. The office can ask for more.');
      return;
    }
    if (hours.trim() && !/^\d+(\.\d{1,2})?$/.test(hours.trim())) {
      Alert.alert('Hours', 'Enter hours as a number, like 3 or 2.5.');
      return;
    }
    const costClean = cost.trim().replace(/^£/, '').replace(/,/g, '');
    if (costClean && !/^\d+(\.\d{1,2})?$/.test(costClean)) {
      Alert.alert('Cost', 'Enter the cost in pounds, like 180 or 180.50.');
      return;
    }
    setSubmitting(true);

    const form = new FormData();
    form.append('jobId', String(jobId));
    form.append('kind', kind);
    form.append('description', description.trim());
    if (hours.trim()) form.append('hours', hours.trim());
    if (materials.trim()) form.append('materials', materials.trim());
    if (costClean) form.append('cost', costClean);
    photos.forEach((uri, i) => {
      form.append('photos', { uri, name: `variation_${Date.now()}_${i}.jpg`, type: 'image/jpeg' } as any);
    });

    try {
      const res = await authFormFetch('/api/installer/variations', form);
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Could not raise it', data.error || 'Please try again.');
      } else {
        setDescription('');
        setHours('');
        setMaterials('');
        setCost('');
        setPhotos([]);
        Alert.alert(`${data.reference} raised`, 'The office has it and will price it.', [
          { text: 'OK', onPress: () => { load(); } },
        ]);
      }
    } catch {
      Alert.alert('No connection', 'You need to be online to raise a variation. Your text is still here.');
    }
    setSubmitting(false);
  }

  if (!loading && !available) {
    return (
      <View style={s.screen}>
        <ScreenHeader title="Variations" subtitle={name ? String(name) : undefined} onBack={() => router.back()} />
        <View style={s.body}>
          <EmptyState icon="document-outline" title="Not switched on" body="Your company's plan does not include variations. Tell the office if you need them." />
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <ScreenHeader title="Raise a variation" subtitle={name ? String(name) : undefined} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        <View style={s.kindRow}>
          {KINDS.map(k => (
            <TouchableOpacity
              key={k.value}
              onPress={() => setKind(k.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === k.value }}
              style={[s.kindBtn, kind === k.value && s.kindBtnOn]}
            >
              <Text style={[s.kindText, kind === k.value && s.kindTextOn]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.hint}>{KINDS.find(k => k.value === kind)?.hint}</Text>

        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What changed, and who asked for it?"
          placeholderTextColor={C.muted}
          multiline
          maxLength={8000}
          style={[s.input, s.inputTall]}
        />

        <View style={s.row}>
          <View style={s.half}>
            <Text style={s.label}>Hours</Text>
            <TextInput value={hours} onChangeText={setHours} placeholder="e.g. 3.5" placeholderTextColor={C.muted}
              keyboardType="decimal-pad" style={s.input} maxLength={8} />
          </View>
          <View style={s.half}>
            <Text style={s.label}>Cost (£)</Text>
            <TextInput value={cost} onChangeText={setCost} placeholder="e.g. 180" placeholderTextColor={C.muted}
              keyboardType="decimal-pad" style={s.input} maxLength={12} />
          </View>
        </View>

        <Text style={s.label}>Materials</Text>
        <TextInput
          value={materials}
          onChangeText={setMaterials}
          placeholder="e.g. 2 x 2.4m aluminium mullions, sealant"
          placeholderTextColor={C.muted}
          multiline
          maxLength={4000}
          style={s.input}
        />

        <View style={s.photoRow}>
          {photos.map((uri, i) => (
            <TouchableOpacity key={uri} onPress={() => setPhotos(p => p.filter((_, x) => x !== i))}>
              <Image source={{ uri }} style={s.thumb} />
              <Text style={s.removeHint}>tap to remove</Text>
            </TouchableOpacity>
          ))}
          {photos.length < MAX_PHOTOS && (
            <>
              <TouchableOpacity style={s.addPhoto} onPress={() => addPhoto('camera')}>
                <Text style={s.addPhotoText}>+ Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addPhoto} onPress={() => addPhoto('library')}>
                <Text style={s.addPhotoText}>From library</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <PrimaryButton
          label={submitting ? 'Sending…' : kind === 'daywork' ? 'Raise daywork' : 'Raise variation'}
          onPress={submit}
          disabled={submitting}
        />

        <Text style={s.sectionLabel}>Raised on this job</Text>
        {loading && <Text style={s.muted}>Loading…</Text>}
        {!loading && existing.length === 0 && (
          <EmptyState icon="document-outline" title="Nothing yet" body="No variations or dayworks on this job." />
        )}
        {existing.map(v => (
          <View key={v.id} style={[s.card, v.status === 'pending' ? s.cardPending : null]}>
            <Text style={s.cardTitle}>{v.reference} · {v.statusLabel}</Text>
            <Text style={s.cardMeta}>
              {v.raisedBy} · {new Date(v.raisedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              {v.labourHours != null ? ` · ${v.labourHours}h` : ''}
            </Text>
            <Text style={s.cardBody}>{v.description}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: space.md, paddingBottom: space.xl * 2, gap: space.sm },
  muted: { ...type.body, color: C.muted },
  hint: { ...type.caption, marginBottom: space.xs },
  kindRow: { flexDirection: 'row', gap: space.sm },
  kindBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: C.border,
  },
  kindBtnOn: { backgroundColor: C.teal },
  kindText: { ...type.body },
  kindTextOn: { color: colors.base, fontWeight: '700' },
  label: { ...type.caption, marginTop: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
  input: {
    backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    padding: space.md, textAlignVertical: 'top', ...type.body,
  },
  inputTall: { minHeight: 120 },
  photoRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'flex-start' },
  thumb: { width: 84, height: 84, borderRadius: 8 },
  removeHint: { ...type.caption, fontSize: 10, textAlign: 'center', marginTop: 2 },
  addPhoto: {
    width: 84, height: 84, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed',
    borderColor: colors.surface3, alignItems: 'center', justifyContent: 'center',
  },
  addPhotoText: { ...type.caption, textAlign: 'center' },
  sectionLabel: {
    ...type.caption, textTransform: 'uppercase', letterSpacing: 1,
    marginTop: space.lg, marginBottom: space.xs,
  },
  card: {
    backgroundColor: C.card, borderRadius: 12, padding: space.md,
    borderWidth: 1, borderColor: C.border, gap: 3,
  },
  cardPending: { borderColor: alpha(C.amber, 0.5) },
  cardTitle: { ...type.body, fontWeight: '600' as const },
  cardMeta: { ...type.caption },
  cardBody: { ...type.body, marginTop: 2 },
});
