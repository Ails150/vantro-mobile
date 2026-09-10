import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import ScreenHeader from '@/components/ScreenHeader';
import EmptyState from '@/components/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useT } from '@/context/LanguageContext';
import { buildWorkerQr } from '@/lib/qr';
import { alpha, colors, radius, space, type } from '@/theme';

/**
 * The worker's own code, for a supervisor to scan.
 *
 * Rendered from what is already in the auth context, so it works with no
 * signal - which is the point, because the moment someone is asked to identify
 * themselves on site is exactly when there is no bar of reception.
 */
export default function MyQrScreen() {
  const router = useRouter();
  const t = useT();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  // Bounded so the code stays scannable on a small phone without overflowing a
  // large one; QR readers cope badly with a code that runs to the screen edge.
  const size = Math.round(Math.max(180, Math.min(280, width - space.xl * 2 - 48)));

  const value = useMemo(
    () => (user ? buildWorkerQr(user.userId, user.companyId) : null),
    [user?.userId, user?.companyId],
  );

  return (
    <View style={s.safe}>
      <ScreenHeader
        title={t('qr.myTitle')}
        subtitle={t('qr.mySubtitle')}
        onBack={() => router.back()}
      />

      {!value ? (
        <EmptyState
          icon="person-circle-outline"
          title={t('qr.myTitle')}
          body={t('login.emailPrompt')}
        />
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.card}>
            {/* The quiet zone and the white ground are not decoration: a reader
                needs the light modules light, whatever the app's dark theme is
                doing around it. */}
            <View style={s.qrGround}>
              <QRCode
                value={value}
                size={size}
                backgroundColor="#FFFFFF"
                color="#000000"
                ecl="M"
              />
            </View>

            <Text style={s.name} numberOfLines={2}>{user?.name}</Text>
            {user?.role ? <Text style={s.role}>{user.role}</Text> : null}
          </View>

          <View style={s.note}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <Text style={s.noteTxt}>{t('qr.identifies')}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { padding: space.xl, alignItems: 'center' },
  card: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.lg,
  },
  qrGround: {
    backgroundColor: '#FFFFFF',
    padding: space.lg,
    borderRadius: radius.md,
  },
  name: { ...type.heading, textAlign: 'center' },
  role: { ...type.sub, marginTop: -space.md, textTransform: 'capitalize' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.lg,
    paddingHorizontal: space.sm,
  },
  noteTxt: { ...type.caption, flex: 1, lineHeight: 18 },
});
