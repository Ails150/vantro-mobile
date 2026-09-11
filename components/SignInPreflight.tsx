import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACCURACY_LIMIT_M, isAccurateEnough } from '@/lib/geo';
import { useT } from '@/context/LanguageContext';
import { alpha, colors, formatDistance, radius, space, type } from '@/theme';

/**
 * What the worker sees between pressing "Sign in" and the request going out.
 *
 * The old flow read a location and posted it, and the first thing the worker
 * learned about their GPS was a refusal from the server: "You are 312 m from
 * Kentford." That is the worst moment to find out, because by then they have
 * no idea whether to walk, wait, or whether the phone is simply lying.
 *
 * So the two numbers that decide the outcome are shown BEFORE the request:
 * how good the fix is, and how far outside the boundary it puts them. A fix
 * worse than ACCURACY_LIMIT_M does not fail -- standing between two tower
 * blocks is not the worker's fault -- it offers Retry, which is nearly always
 * what fixes it.
 */

export type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type Props = {
  visible: boolean;
  jobName: string;
  /** Null while the first fix is still being taken. */
  fix: Fix | null;
  /** Metres outside the site boundary. 0 means inside it. Null if unknown. */
  metresOutside: number | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function SignInPreflight({
  visible, jobName, fix, metresOutside, busy, error, onRetry, onConfirm, onCancel,
}: Props) {
  const t = useT();
  const accurate = isAccurateEnough(fix?.accuracy);
  const inside = metresOutside != null && metresOutside === 0;
  const locating = !fix && !error;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title} numberOfLines={2}>{jobName}</Text>

          {locating ? (
            <View style={s.locating}>
              <ActivityIndicator color={colors.teal} />
              <Text style={s.locatingTxt}>{t('preflight.checking')}</Text>
            </View>
          ) : (
            <>
              <View style={s.readings}>
                <Reading
                  icon={accurate ? 'locate' : 'locate-outline'}
                  tone={accurate ? 'ok' : 'warn'}
                  label={t('preflight.accuracy')}
                  value={fix?.accuracy != null ? `±${Math.round(fix.accuracy)} m` : t('preflight.unknown')}
                />
                <Reading
                  icon={inside ? 'checkmark-circle' : 'walk'}
                  tone={inside ? 'ok' : 'warn'}
                  label={t('preflight.distance')}
                  value={
                    metresOutside == null ? t('preflight.unknown')
                      : inside ? t('preflight.inside')
                      : t('preflight.outside', { distance: formatDistance(metresOutside) })
                  }
                />
              </View>

              {!accurate && (
                <Text style={s.note}>
                  {t('preflight.poorFix', {
                    accuracy: fix?.accuracy != null
                      ? `${Math.round(fix.accuracy)} m`
                      : t('preflight.unknown').toLowerCase(),
                    limit: ACCURACY_LIMIT_M,
                  })}
                </Text>
              )}

              {error ? <Text style={s.error}>{error}</Text> : null}
            </>
          )}

          <View style={s.actions}>
            {/* When the fix is poor, Retry is the main action rather than a
                dead end. Signing in stays available underneath it: the server
                re-checks the distance, so a worker who knows they are on site
                is never locked out by their own phone. */}
            {!accurate && !locating ? (
              <>
                <Pressable
                  onPress={onRetry}
                  disabled={busy}
                  accessibilityRole="button"
                  style={({ pressed }) => [s.primary, pressed && s.pressed, busy && s.off]}
                >
                  <Ionicons name="refresh" size={17} color={colors.base} />
                  <Text style={s.primaryTxt}>
                    {busy ? t('preflight.retrying') : t('preflight.retry')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onConfirm}
                  disabled={busy}
                  accessibilityRole="button"
                  style={({ pressed }) => [s.secondary, pressed && s.pressed]}
                >
                  <Text style={s.secondaryTxt}>{t('preflight.signInAnyway')}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={onConfirm}
                disabled={busy || locating}
                accessibilityRole="button"
                style={({ pressed }) => [s.primary, pressed && s.pressed, (busy || locating) && s.off]}
              >
                <Text style={s.primaryTxt}>
                  {busy ? t('preflight.signingIn') : t('preflight.signIn')}
                </Text>
              </Pressable>
            )}

            <Pressable onPress={onCancel} disabled={busy} hitSlop={8} style={s.cancel}>
              <Text style={s.cancelTxt}>{t('preflight.notNow')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Reading({
  icon, tone, label, value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'ok' | 'warn';
  label: string;
  value: string;
}) {
  const colour = tone === 'ok' ? colors.teal : colors.amber;
  return (
    <View style={s.reading}>
      <View style={[s.readingIcon, { backgroundColor: alpha(colour, 0.12) }]}>
        <Ionicons name={icon} size={16} color={colour} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.readingLabel}>{label}</Text>
        <Text style={s.readingValue}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: space.xl,
  },
  sheet: {
    width: '100%', maxWidth: 420,
    backgroundColor: colors.surface1, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: space.xl, gap: space.lg,
  },
  title: { ...type.heading },

  locating: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  locatingTxt: { ...type.sub },

  readings: { gap: space.md },
  reading: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  readingIcon: {
    width: 32, height: 32, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  readingLabel: { ...type.caption },
  readingValue: { ...type.body, fontWeight: '600', fontVariant: ['tabular-nums'] },

  note: { ...type.sub, lineHeight: 20 },
  error: { ...type.sub, color: colors.red },

  actions: { gap: space.sm },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 16,
  },
  primaryTxt: { color: colors.base, fontSize: 16, fontWeight: '700' },
  secondary: {
    alignItems: 'center', borderRadius: radius.md, paddingVertical: 14,
    backgroundColor: colors.surface2,
  },
  secondaryTxt: { ...type.body, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.5 },
  cancel: { alignItems: 'center', paddingVertical: space.sm },
  cancelTxt: { ...type.sub },
});
