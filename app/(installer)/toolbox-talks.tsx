import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, PanResponder, Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { authFetch } from '@/lib/api';
import ScreenHeader from '@/components/ScreenHeader';
import PrimaryButton from '@/components/PrimaryButton';
import EmptyState from '@/components/EmptyState';
import { alpha, colors, space, type } from '@/theme';

const C = {
  bg: colors.base, card: colors.surface1, teal: colors.teal, muted: colors.textMuted,
  text: colors.textPrimary, border: alpha(colors.textPrimary, 0.05), red: colors.red, amber: colors.amber,
};

type Talk = {
  id: string;
  jobId: string;
  jobName: string | null;
  title: string;
  notes: string | null;
  deliveredAt: string;
  deliveredBy: string | null;
  signedAt: string | null;
};

const PAD_HEIGHT = 200;

/**
 * Draw-to-sign pad.
 *
 * PanResponder rather than a gesture-handler component: this pad lives inside a
 * ScrollView, and the responder has to claim the gesture on the first move or
 * the scroll steals it and the signature comes out as disconnected dots.
 *
 * Strokes are kept as arrays of points and rendered as SVG paths, so what is
 * submitted is the same geometry that is on screen -- not a rasterised
 * screenshot whose resolution depends on the handset.
 */
function SignaturePad({
  onChange,
}: {
  onChange: (strokes: number[][][]) => void;
}) {
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
      // Without this the parent ScrollView wins any vertical drag, which is
      // most of a signature.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current = [[
          Math.round(e.nativeEvent.locationX),
          Math.round(e.nativeEvent.locationY),
        ]];
      },
      onPanResponderMove: (e) => {
        const x = Math.round(e.nativeEvent.locationX);
        const y = Math.round(e.nativeEvent.locationY);
        const pts = current.current;
        const last = pts[pts.length - 1];
        // Drop sub-pixel jitter: it triples the path length for nothing.
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

  const toPath = (pts: number[][]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');

  const live = current.current.length > 1 ? [current.current] : [];

  return (
    <View>
      <View style={s.pad} {...responder.panHandlers}>
        <Svg width="100%" height={PAD_HEIGHT}>
          {[...strokes, ...live].map((stroke, i) => (
            <Path
              key={i}
              d={toPath(stroke)}
              stroke={C.text}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
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

/** The drawn strokes as an SVG data URI. Plain paths only -- the server
 *  rejects anything with markup in it, and rightly so. */
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

export default function ToolboxTalksScreen() {
  const { id: jobId, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const [talks, setTalks] = useState<Talk[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [padWidth, setPadWidth] = useState(320);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = jobId ? `/api/installer/toolbox-talks?jobId=${jobId}` : '/api/installer/toolbox-talks';
      const res = await authFetch(url);
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not load talks');
      else setTalks(data.talks || []);
    } catch {
      setError('No connection. Toolbox talks need to be signed online.');
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function sign(talk: Talk) {
    if (strokes.filter(st => st.length > 1).length === 0) {
      Alert.alert('Signature needed', 'Draw your signature in the box before submitting.');
      return;
    }
    setSubmitting(true);

    // Location is supporting detail, not a requirement. A worker in a basement
    // with no fix still has to be able to sign, so a failure here is silent and
    // the server stores null rather than a guess.
    let lat: number | null = null;
    let lng: number | null = null;
    let accuracy: number | null = null;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
        accuracy = typeof loc.coords.accuracy === 'number' ? loc.coords.accuracy : null;
      }
    } catch { /* no fix, sign anyway */ }

    try {
      const res = await authFetch('/api/installer/toolbox-talks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          talkId: talk.id,
          signature: strokesToDataUri(strokes, padWidth),
          lat, lng, accuracy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Could not sign', data.error || 'Please try again.');
      } else {
        setOpenId(null);
        setStrokes([]);
        await load();
      }
    } catch {
      Alert.alert('No connection', 'You need to be online to sign a toolbox talk.');
    }
    setSubmitting(false);
  }

  const unsigned = talks.filter(t => !t.signedAt);
  const signed = talks.filter(t => t.signedAt);

  return (
    <View style={s.screen}>
      <ScreenHeader title="Toolbox talks" subtitle={name ? String(name) : undefined} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {loading && <Text style={s.muted}>Loading…</Text>}
        {error && <Text style={s.error}>{error}</Text>}

        {!loading && talks.length === 0 && !error && (
          <EmptyState
            icon="shield-checkmark-outline"
            title="Nothing to sign"
            body="No toolbox talks have been given on your jobs yet."
          />
        )}

        {unsigned.length > 0 && <Text style={s.sectionLabel}>Waiting for your signature</Text>}
        {unsigned.map(t => (
          <View key={t.id} style={[s.card, s.cardDue]}>
            <Text style={s.title}>{t.title}</Text>
            <Text style={s.meta}>
              {t.jobName}
              {t.deliveredBy ? ` · ${t.deliveredBy}` : ''}
              {' · '}
              {new Date(t.deliveredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </Text>
            {t.notes ? <Text style={s.notes}>{t.notes}</Text> : null}

            {openId === t.id ? (
              <View
                style={s.signBlock}
                onLayout={e => setPadWidth(e.nativeEvent.layout.width)}
              >
                <Text style={s.signPrompt}>
                  By signing you confirm you received this briefing and understood it.
                </Text>
                <SignaturePad onChange={setStrokes} />
                <PrimaryButton
                  label={submitting ? 'Submitting…' : 'Submit signature'}
                  onPress={() => sign(t)}
                  disabled={submitting}
                />
                <TouchableOpacity onPress={() => { setOpenId(null); setStrokes([]); }}>
                  <Text style={s.cancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.signBtn} onPress={() => { setOpenId(t.id); setStrokes([]); }}>
                <Text style={s.signBtnText}>Read and sign</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {signed.length > 0 && <Text style={s.sectionLabel}>Signed</Text>}
        {signed.map(t => (
          <View key={t.id} style={s.card}>
            <Text style={s.title}>{t.title}</Text>
            <Text style={s.meta}>{t.jobName}</Text>
            <Text style={s.signedAt}>
              Signed {new Date(t.signedAt!).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
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
  error: { ...type.body, color: C.red, marginBottom: space.sm },
  sectionLabel: {
    ...type.caption, textTransform: 'uppercase',
    letterSpacing: 1, marginTop: space.md, marginBottom: space.xs,
  },
  card: {
    backgroundColor: C.card, borderRadius: 12, padding: space.md,
    borderWidth: 1, borderColor: C.border, gap: 4,
  },
  cardDue: { borderColor: alpha(C.amber, 0.5) },
  title: { ...type.heading },
  meta: { ...type.caption, color: C.muted },
  notes: { ...type.body, color: C.text, marginTop: space.xs },
  signedAt: { ...type.caption, color: C.teal, marginTop: space.xs },
  signBtn: {
    marginTop: space.sm, backgroundColor: C.teal, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  signBtnText: { ...type.body, fontWeight: '600' as const, color: C.bg },
  signBlock: { marginTop: space.sm, gap: space.sm },
  signPrompt: { ...type.caption, color: C.muted },
  pad: {
    height: PAD_HEIGHT, backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', justifyContent: 'center',
  },
  padHint: {
    position: 'absolute', alignSelf: 'center', ...type.caption, color: '#9aa3ad',
  },
  clearBtn: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4 },
  clearText: { ...type.caption, color: C.muted, textDecorationLine: 'underline' },
  cancel: { ...type.caption, color: C.muted, textAlign: 'center', paddingVertical: 8 },
});
