import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, space, radius } from '../theme';

type Props = {
  label: string;
  blockedLabel?: string;
  disabled?: boolean;
  onPress?: () => void;
};

export default function PrimaryButton({ label, blockedLabel, disabled, onPress }: Props) {
  const off = !!disabled;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      style={[s.btn, off && s.off]}
    >
      <Text style={[s.txt, off && s.txtOff]}>{off && blockedLabel ? blockedLabel : label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: colors.teal, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  off: { backgroundColor: colors.surface2 },
  txt: { color: colors.base, fontSize: 16, fontWeight: '700' },
  txtOff: { color: colors.textMuted },
});
