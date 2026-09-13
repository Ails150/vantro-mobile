import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, PanResponder, Alert, Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authFetch } from '@/lib/api';
import ScreenHeader from '@/components/ScreenHeader';
import PrimaryButton from '@/components/PrimaryButton';
import { alpha, colors, space, type } from '@/theme';

const C = {
  bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted,
  text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red, amber: colors.amber,
};

const PAD_HEIGHT = 200;

/** Same pad as the toolbox screen: PanResponder because it lives in a
 *  ScrollView and the responder has to claim the gesture on the first move. */
function SignaturePad({ onChange }: { onChange: (strokes: number[][][]) => void }) {
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const current = useRef<number[][]>([]);
  const strokesRef = useRef<number[][][]>([]);

  const commit = useCallback((next: number[][][]) => {
    strokesRef.current = next;
    setStrokes(next);
    onChange(next);
  }, [onChange]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current = [[Math.round(e.nativeEvent.locationX), Math.round(e.nativeEvent.locationY)]];
      },
      onPanResponderMove: (e) => {
        const x = Math.round(e.nativeEvent.locationX);
        const y = Math.round(e.nativeEvent.locationY);
        const pts = current.current;
        const last = pts[pts.length - 1];
        if (!last || Math.abs(last[0] - x) > 1 || Math.abs(last[1] - y) > 1) {
          pts.push([x, y]);
          setStrokes([...strokesRef.current, [...pts]]);
        }
      },
      onPanResponderRelease: () => {
        if (current.current.length > 1) {
          const next = [...strokesRef.current, current.current];
          strokesRef.current = next;
          setStrokes(next);
          onChange(next);
        } else {
          setStrokes([...strokesRef.current]);
        }
        current.current = [];
      },
    })
  ).current;

  const toPath = (pts: number[][]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
  const live = current.current.length > 1 ? [current.current] : [];

  return (
    <View>
      <View style={s.pad} {...responder.panHandlers}>
        <Svg width="100%" height={PAD_HEIGHT}>
          {[...strokes, ...live].map((stroke, i) => (
            <Path key={i} d={toPath(stroke)} stroke={C.text} strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </Svg>
        {strokes.length === 0 && (
          <Text style={s.padHint} pointerEvents="none">Sign here with your finger</Text>
        )}
      </View>
      <TouchableOpacity onPress={() => commit([])} style={s.clearBtn}>
        <Text style={s.clearText}>Clear</Text>
      </TouchableOpacity>
    </View>
  );
}

function strokesToDataUri(strokes: number[][][], width: number): string {
  const paths = strokes
    .filter(st => st.length > 1)
    .map(st => {
      const d = st.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
      return `<path d="${d}" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${PAD_HEIGHT}" ` +
    `viewBox="0 0 ${Math.round(width)} ${PAD_HEIGHT}">${paths}</svg>`;
  return 'data:image/svg+xml;base64,' + global.btoa(unescape(encodeURIComponent(svg)));
}

export default function RamsScreen() {
  const { id: jobId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [padWidth, setPadWidth] = useState(320);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  // When the document was opened, so read_seconds is a real measurement rather
  // than a number the client invented. Null until they actually open it.
  const openedAt = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/installer/rams?jobId=${jobId}`);
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not load the RAMS');
      else setState(data);
    } catch {
      setError('No connection. You need to be online to read and sign the RAMS.');
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function openDocument() {
    if (!state?.rams?.documentUrl) return;
    openedAt.current = Date.now();
    setOpened(true);
    try {
      await Linking.openURL(state.rams.documentUrl);
    } catch {
      Alert.alert('Could not open', 'No app on this phone can open a PDF.');
    }
  }

  async function sign() {
    if (strokes.filter(st => st.length > 1).length === 0) {
      Alert.alert('Signature needed', 'Draw your signature in the box before submitting.');
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
    } catch { /* sign anyway */ }

    try {
      const res = await authFetch('/api/installer/rams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ramsId: state.rams.id,
          signature: strokesToDataUri(strokes, padWidth),
          readSeconds: openedAt.current ? Math.round((Date.now() - openedAt.current) / 1000) : null,
          lat, lng, accuracy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Could not sign', data.error || 'Please try again.');
        if (data.superseded) load();
      } else {
        Alert.alert('Signed', 'You can now sign in to this job.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch {
      Alert.alert('No connection', 'You need to be online to sign the RAMS.');
    }
    setSubmitting(false);
  }

  return (
    <View style={s.screen}>
      <ScreenHeader title="RAMS" subtitle={name ? String(name) : state?.jobName} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {loading && <Text style={s.muted}>Loading…</Text>}
        {error && <Text style={s.error}>{error}</Text>}

        {!loading && !error && !state?.required && (
          <View style={s.card}>
            <Text style={s.title}>No RAMS for this job</Text>
            <Text style={s.notes}>
              Nothing to sign. You can sign in to this job as normal.
            </Text>
          </View>
        )}

        {!loading && !error && state?.required && state?.rams && (
          <View
            style={[s.card, state.blocked ? s.cardDue : null]}
            onLayout={e => setPadWidth(e.nativeEvent.layout.width - space.md * 2)}
          >
            <Text style={s.title}>{state.rams.title}</Text>
            <Text style={s.meta}>Version {state.rams.version}</Text>

            {state.blocked && (
              <Text style={s.blockNotice}>{state.message}</Text>
            )}
            {!state.blocked && (
              <Text style={s.signedAt}>You have signed this version. You are clear to sign in.</Text>
            )}

            {state.rams.notes ? <Text style={s.notes}>{state.rams.notes}</Text> : null}

            <TouchableOpacity style={s.docBtn} onPress={openDocument}>
              <Text style={s.docBtnText}>{opened ? 'Open the document again' : 'Read the document'}</Text>
            </TouchableOpacity>

            {state.blocked && (
              <View style={s.signBlock}>
                {!opened && (
                  <Text style={s.readFirst}>
                    Open and read the document before you sign. Your signature says you have read
                    and understood it.
                  </Text>
                )}
                <Text style={s.signPrompt}>
                  By signing you confirm you have read and understood this method statement and
                  will work to it.
                </Text>
                <SignaturePad onChange={setStrokes} />
                <PrimaryButton
                  label={submitting ? 'Submitting…' : 'Sign and continue'}
                  onPress={sign}
                  disabled={submitting}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: space.md, paddingBottom: space.xl * 2, gap: space.sm },
  muted: { ...type.body, color: C.muted },
  error: { ...type.body, color: C.red },
  card: {
    backgroundColor: C.card, borderRadius: 12, padding: space.md,
    borderWidth: 1, borderColor: C.border, gap: 6,
  },
  cardDue: { borderColor: alpha(C.amber, 0.5) },
  title: { ...type.heading },
  meta: { ...type.caption },
  notes: { ...type.body, marginTop: space.xs },
  blockNotice: {
    ...type.body, color: C.amber, marginTop: space.xs, lineHeight: 21,
  },
  signedAt: { ...type.caption, color: C.teal, marginTop: space.xs },
  docBtn: {
    marginTop: space.sm, backgroundColor: colors.surface2, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  docBtnText: { ...type.body, fontWeight: '600' as const },
  signBlock: { marginTop: space.md, gap: space.sm },
  readFirst: { ...type.caption, color: C.amber },
  signPrompt: { ...type.caption },
  pad: {
    height: PAD_HEIGHT, backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', justifyContent: 'center',
  },
  padHint: { position: 'absolute', alignSelf: 'center', ...type.caption, color: '#9aa3ad' },
  clearBtn: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4 },
  clearText: { ...type.caption, textDecorationLine: 'underline' },
});
