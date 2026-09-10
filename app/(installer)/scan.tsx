import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Linking, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '@/components/ScreenHeader';
import PrimaryButton from '@/components/PrimaryButton';
import { useT } from '@/context/LanguageContext';
import { parseVantroQr, type VantroPayload } from '@/lib/qr';
import { getCachedJobs } from '@/lib/offline';
import { alpha, colors, radius, space, type } from '@/theme';

type Outcome =
  | { kind: 'worker'; userId: string }
  | { kind: 'error'; message: string };

export default function ScanScreen() {
  const router = useRouter();
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // onBarcodeScanned fires on every frame the camera resolves a code in, which
  // is many times a second. Without a latch, one code held in front of the lens
  // pushes the same route over and over.
  const latched = useRef(false);

  const resume = useCallback(() => {
    latched.current = false;
    setOutcome(null);
    setBusy(false);
  }, []);

  const handle = useCallback(async (raw: string) => {
    if (latched.current) return;
    latched.current = true;
    setBusy(true);

    const result = parseVantroQr(raw);
    if (!result.ok) {
      const message =
        result.reason === 'not_vantro' ? t('qr.notVantro')
        : result.reason === 'unsupported_version' ? t('qr.unsupported')
        : result.reason === 'unknown_kind' ? t('qr.unknownKind')
        : t('qr.malformed');
      setOutcome({ kind: 'error', message });
      setBusy(false);
      return;
    }

    const payload: VantroPayload = result.payload;

    if (payload.kind === 'job') {
      // Matched against the cached list rather than fetched, so a code still
      // works in a basement with no signal. A job that is not on the list is
      // the useful answer here: it means the code is for someone else's work,
      // not that the scan failed.
      const jobs = await getCachedJobs();
      const job = jobs.find((j: any) => String(j.id) === payload.jobId);
      if (!job) {
        setOutcome({ kind: 'error', message: t('qr.jobNotFound') });
        setBusy(false);
        return;
      }
      router.replace({
        pathname: '/(installer)/job/[id]' as any,
        params: { id: job.id, name: job.name },
      });
      return;
    }

    // A worker code identifies whoever it came from. The app can say who that
    // is; it cannot record an attendance scan, because no endpoint takes one.
    setOutcome({ kind: 'worker', userId: payload.userId });
    setBusy(false);
  }, [router, t]);

  if (!permission) {
    return (
      <View style={s.safe}>
        <ScreenHeader title={t('qr.scanTitle')} onBack={() => router.back()} />
        <View style={s.centre}><ActivityIndicator color={colors.teal} /></View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.safe}>
        <ScreenHeader title={t('qr.scanTitle')} onBack={() => router.back()} />
        <View style={s.centre}>
          <View style={s.ring}>
            <Ionicons name="camera-outline" size={30} color={colors.surface3} />
          </View>
          <Text style={s.permTitle}>{t('qr.permissionTitle')}</Text>
          <Text style={s.permBody}>{t('qr.permissionBody')}</Text>
          <View style={s.permBtn}>
            {/* Once the OS has been told no for good, asking again does nothing
                at all, and the only route left is Settings. */}
            {permission.canAskAgain ? (
              <PrimaryButton label={t('qr.grant')} onPress={() => requestPermission()} />
            ) : (
              <PrimaryButton label={t('qr.openSettings')} onPress={() => Linking.openSettings()} />
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.safe}>
      <ScreenHeader
        title={t('qr.scanTitle')}
        onBack={() => router.back()}
        showSync={false}
        right={
          <Pressable
            onPress={() => setTorch(v => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('qr.torch')}
            accessibilityState={{ selected: torch }}
            style={[s.torch, torch && s.torchOn]}
          >
            <Ionicons
              name={torch ? 'flashlight' : 'flashlight-outline'}
              size={20}
              color={torch ? colors.base : colors.teal}
            />
          </Pressable>
        }
      />

      <View style={s.viewport}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={outcome || busy ? undefined : ({ data }) => { handle(data); }}
        />

        <View pointerEvents="none" style={s.reticleWrap}>
          {/* A sight line only. The scanner reads the whole frame, so a code
              that lands outside the box still resolves. */}
          <View style={s.reticle} />
          <Text style={s.prompt}>{t('qr.scanPrompt')}</Text>
        </View>
      </View>

      {outcome ? (
        <View style={s.result}>
          {outcome.kind === 'worker' ? (
            <>
              <View style={s.resultHead}>
                <Ionicons name="person-circle-outline" size={22} color={colors.teal} />
                <Text style={s.resultTitle}>{t('qr.myTitle')}</Text>
              </View>
              <Text style={s.mono} numberOfLines={1} ellipsizeMode="middle">{outcome.userId}</Text>
              <Text style={s.resultNote}>{t('qr.identifies')}</Text>
            </>
          ) : (
            <View style={s.resultHead}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.amber} />
              <Text style={s.resultTitle}>{outcome.message}</Text>
            </View>
          )}
          <View style={s.resultBtn}>
            <PrimaryButton label={t('qr.scanAgain')} onPress={resume} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },

  ring: {
    width: 64, height: 64, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    marginBottom: space.lg,
  },
  permTitle: { ...type.heading, textAlign: 'center' },
  permBody: { ...type.sub, textAlign: 'center', marginTop: space.sm },
  permBtn: { alignSelf: 'stretch', marginTop: space.xl, paddingHorizontal: space.xl },

  torch: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: alpha(colors.teal, 0.12),
    borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(colors.teal, 0.35),
  },
  torchOn: { backgroundColor: colors.teal, borderColor: colors.teal },

  viewport: { flex: 1, backgroundColor: colors.black, overflow: 'hidden' },
  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: 232, height: 232,
    borderWidth: 2, borderColor: alpha(colors.textPrimary, 0.9),
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  prompt: {
    ...type.sub,
    color: colors.textPrimary,
    marginTop: space.lg,
    textAlign: 'center',
    paddingHorizontal: space.xl,
  },

  result: {
    backgroundColor: colors.surface1,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    padding: space.xl,
    gap: space.sm,
  },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  resultTitle: { ...type.heading, flex: 1 },
  mono: { ...type.sub, color: colors.textPrimary },
  resultNote: { ...type.caption, lineHeight: 18 },
  resultBtn: { marginTop: space.md },
});
