import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch, authFormFetch } from '@/lib/api';
import ScreenHeader from '@/components/ScreenHeader';
import PrimaryButton from '@/components/PrimaryButton';
import EmptyState from '@/components/EmptyState';
import { alpha, colors, space, type } from '@/theme';

const C = {
  bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted,
  text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red, amber: colors.amber,
};

// `on` carries the text colour: amber and red take the dark base, surface3 does not.
const KINDS = [
  { label: 'Near miss', value: 'near_miss', fill: colors.surface3, on: colors.textPrimary },
  { label: 'Hazard', value: 'hazard', fill: colors.amber, on: colors.base },
  { label: 'Injury', value: 'injury', fill: colors.red, on: colors.base },
] as const;

const MAX_PHOTOS = 4;

export default function IncidentsScreen() {
  const { id: jobId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();

  const [kind, setKind] = useState<string>('near_miss');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/installer/incidents?jobId=${jobId}`);
      const data = await res.json();
      if (res.ok) setExisting(data.incidents || []);
    } catch { /* offline: the form still works, the list just does not load */ }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function addPhoto() {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Enough photos', `Up to ${MAX_PHOTOS} on one report.`);
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Camera needed', 'Allow camera access to add a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotos(p => [...p, result.assets[0].uri]);
    }
  }

  async function submit() {
    if (!description.trim()) {
      Alert.alert('Describe it', 'Say what happened, even briefly.');
      return;
    }
    setSubmitting(true);

    let lat: number | null = null, lng: number | null = null, accuracy: number | null = null;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        accuracy = typeof loc.coords.accuracy === 'number' ? loc.coords.accuracy : null;
      }
    } catch { /* report anyway */ }

    const form = new FormData();
    form.append('jobId', String(jobId));
    form.append('kind', kind);
    form.append('description', description.trim());
    if (lat != null) form.append('lat', String(lat));
    if (lng != null) form.append('lng', String(lng));
    if (accuracy != null) form.append('accuracy', String(accuracy));
    photos.forEach((uri, i) => {
      form.append('photos', { uri, name: `incident_${Date.now()}_${i}.jpg`, type: 'image/jpeg' } as any);
    });

    try {
      const res = await authFormFetch('/api/installer/incidents', form);
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Could not report', data.error || 'Please try again.');
      } else {
        setDescription('');
        setPhotos([]);
        setKind('near_miss');
        Alert.alert('Reported', 'Your supervisor has been alerted.', [
          { text: 'OK', onPress: () => { load(); } },
        ]);
      }
    } catch {
      Alert.alert('No connection', 'You need to be online to report an incident.');
    }
    setSubmitting(false);
  }

  return (
    <View style={s.screen}>
      <ScreenHeader title="Report an incident" subtitle={name ? String(name) : undefined} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        <Text style={s.lead}>
          Report a near miss even when nothing was damaged and nobody was hurt. That is the one
          that stops the next one.
        </Text>

        <View style={s.kindRow}>
          {KINDS.map(k => (
            <TouchableOpacity
              key={k.value}
              onPress={() => setKind(k.value)}
              style={[s.kindBtn, kind === k.value && { backgroundColor: k.fill }]}
            >
              <Text style={[s.kindText, kind === k.value && { color: k.on, fontWeight: '700' }]}>
                {k.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What happened?"
          placeholderTextColor={C.muted}
          multiline
          maxLength={8000}
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
            <TouchableOpacity style={s.addPhoto} onPress={addPhoto}>
              <Text style={s.addPhotoText}>+ Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        <PrimaryButton
          label={submitting ? 'Reporting…' : 'Report it'}
          onPress={submit}
          disabled={submitting}
        />

        <Text style={s.sectionLabel}>Already reported on this job</Text>
        {loading && <Text style={s.muted}>Loading…</Text>}
        {!loading && existing.length === 0 && (
          <EmptyState icon="alert-circle-outline" title="Nothing yet" body="No incidents have been reported on this job." />
        )}
        {existing.map(i => (
          <View key={i.id} style={[s.card, i.status !== 'closed' ? s.cardOpen : null]}>
            <Text style={s.cardTitle}>
              {i.kind === 'near_miss' ? 'Near miss' : i.kind === 'injury' ? 'Injury' : 'Hazard'}
              {' · '}
              {i.status === 'closed' ? 'Closed' : i.status === 'acknowledged' ? 'Acknowledged' : 'Open'}
            </Text>
            <Text style={s.cardMeta}>
              {i.reportedBy} · {new Date(i.reportedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </Text>
            <Text style={s.cardBody}>{i.description}</Text>
            {i.closureNotes ? <Text style={s.closure}>Closed: {i.closureNotes}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: space.md, paddingBottom: space.xl * 2, gap: space.sm },
  lead: { ...type.sub, marginBottom: space.xs },
  muted: { ...type.body, color: C.muted },
  kindRow: { flexDirection: 'row', gap: space.sm },
  kindBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: C.border,
  },
  kindText: { ...type.body },
  input: {
    backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    padding: space.md, minHeight: 120, textAlignVertical: 'top', ...type.body,
  },
  photoRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'flex-start' },
  thumb: { width: 84, height: 84, borderRadius: 8 },
  removeHint: { ...type.caption, fontSize: 10, textAlign: 'center', marginTop: 2 },
  addPhoto: {
    width: 84, height: 84, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed',
    borderColor: colors.surface3, alignItems: 'center', justifyContent: 'center',
  },
  addPhotoText: { ...type.caption },
  sectionLabel: {
    ...type.caption, textTransform: 'uppercase', letterSpacing: 1,
    marginTop: space.lg, marginBottom: space.xs,
  },
  card: {
    backgroundColor: C.card, borderRadius: 12, padding: space.md,
    borderWidth: 1, borderColor: C.border, gap: 3,
  },
  cardOpen: { borderColor: alpha(C.amber, 0.5) },
  cardTitle: { ...type.body, fontWeight: '600' as const },
  cardMeta: { ...type.caption },
  cardBody: { ...type.body, marginTop: 2 },
  closure: { ...type.caption, color: C.teal, marginTop: 4 },
});
