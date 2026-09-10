import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, radius, space } from '@/theme';
import { subscribeSync, type SyncState } from '@/lib/offline';
import { useT } from '@/context/LanguageContext';

/**
 * Header indicator for work the device is holding.
 *
 * Renders nothing when there is nothing to say - online with an empty queue -
 * so it stays out of the way on the normal path and only appears when the
 * installer needs to know their sign-in has not landed yet.
 */
export default function SyncBadge() {
  const [state, setState] = useState<SyncState | null>(null);
  const t = useT();

  useEffect(() => subscribeSync(setState), []);

  if (!state) return null;
  const { pending, syncing, online } = state;
  if (pending === 0 && online) return null;

  const tone = syncing ? colors.teal : pending > 0 ? colors.amber : colors.textMuted;

  const label = syncing
    ? t('sync.syncing')
    : pending > 0
      ? t('sync.pending', { count: pending })
      : t('sync.offline');

  const a11y = syncing
    ? t('sync.a11ySyncing')
    : pending > 0
      ? t(online ? 'sync.a11yPending' : 'sync.a11yPendingOffline', { count: pending })
      : t('sync.a11yOffline');

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11y}
      accessibilityLiveRegion="polite"
      style={[s.wrap, { borderColor: alpha(tone, 0.35), backgroundColor: alpha(tone, 0.12) }]}
    >
      {syncing ? (
        <ActivityIndicator size="small" color={tone} />
      ) : (
        <Ionicons name={online ? 'cloud-upload-outline' : 'cloud-offline-outline'} size={14} color={tone} />
      )}
      <Text style={[s.txt, { color: tone }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  txt: { fontSize: 12, fontWeight: '600' },
});
