import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, type } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

export default function ScreenHeader({ title, subtitle, onBack, right }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + space.md }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={s.back}
        >
          <Ionicons name="chevron-back" size={26} color={colors.teal} />
        </Pressable>
      ) : null}

      <View style={s.titles}>
        <Text style={type.title} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[type.sub, { marginTop: 2 }]} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      {right ? <View style={s.right}>{right}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: space.lg,
    paddingHorizontal: space.xl,
    backgroundColor: colors.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { marginLeft: -6 },
  titles: { flex: 1, minWidth: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
