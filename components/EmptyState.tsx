import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, radius, type } from '../theme';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon, title, body, actionLabel, onAction }: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.ring}>
        <Ionicons name={icon} size={30} color={colors.surface3} />
      </View>
      <Text style={[type.heading, s.title]}>{title}</Text>
      {body ? <Text style={[type.sub, s.body]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={s.cta} accessibilityRole="button">
          <Text style={s.ctaTxt}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl, paddingVertical: 64 },
  ring: {
    width: 72, height: 72, borderRadius: radius.pill, marginBottom: space.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', marginTop: space.sm, lineHeight: 21, maxWidth: 300 },
  cta: {
    marginTop: space.xl, backgroundColor: colors.teal,
    paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.md,
  },
  ctaTxt: { color: colors.base, fontSize: 15, fontWeight: '600' },
});
