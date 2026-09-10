import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { LANGUAGES, deviceLanguage, type LanguageCode } from '@/lib/i18n';
import { alpha, colors, radius, space, type } from '@/theme';
import PrimaryButton from '@/components/PrimaryButton';

/**
 * First run language choice, and the only place it can be changed afterwards.
 *
 * `change=1` marks the revisit: it gets a back button and no longer blocks the
 * way to login, because the choice already exists.
 */
export default function LanguageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ change?: string }>();
  const isChange = params.change === '1';
  const { language, setLanguage, t } = useLanguage();

  // Preselected, never applied silently. A phone in English inside a Polish
  // crew is normal, so the installer confirms rather than the device deciding.
  const [selected, setSelected] = useState<LanguageCode>(language ?? deviceLanguage() ?? 'en');

  useEffect(() => {
    // Preview as they tap, so the button underneath is already in the language
    // they are choosing and the choice is self evidently correct.
    setLanguage(selected);
  }, [selected]);

  async function confirm() {
    await setLanguage(selected);
    if (isChange) router.back();
    else router.replace('/login');
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {isChange ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={s.back}
          >
            <Ionicons name="chevron-back" size={26} color={colors.teal} />
          </Pressable>
        ) : null}

        <View style={s.head}>
          <View style={s.globe}>
            <Ionicons name="language-outline" size={28} color={colors.teal} />
          </View>
          <Text style={s.title}>{t('language.title')}</Text>
          <Text style={s.sub}>{t('language.subtitle')}</Text>
        </View>

        <View style={s.list} accessibilityRole="radiogroup">
          {LANGUAGES.map((lang, i) => {
            const on = lang.code === selected;
            return (
              <Pressable
                key={lang.code}
                onPress={() => setSelected(lang.code)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={lang.english}
                style={({ pressed }) => [
                  s.row,
                  i > 0 && s.rowDivider,
                  on && s.rowOn,
                  pressed && s.rowPressed,
                ]}
              >
                <View style={s.rowText}>
                  <Text style={[s.label, on && s.labelOn]}>{lang.label}</Text>
                  {lang.label !== lang.english ? (
                    <Text style={s.english}>{lang.english}</Text>
                  ) : null}
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={colors.teal} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <PrimaryButton label={t('language.confirm')} onPress={confirm} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  back: { alignSelf: 'flex-start', marginLeft: -6, marginBottom: space.md },
  head: { alignItems: 'center', marginTop: space.xl, marginBottom: space.xxl },
  globe: {
    width: 56, height: 56, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: alpha(colors.teal, 0.12),
    borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(colors.teal, 0.35),
    marginBottom: space.lg,
  },
  title: { ...type.title, textAlign: 'center' },
  sub: { ...type.sub, textAlign: 'center', marginTop: space.sm },
  list: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.lg + 2, gap: space.md,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowOn: { backgroundColor: alpha(colors.teal, 0.08) },
  rowPressed: { backgroundColor: colors.surface2 },
  rowText: { flex: 1, minWidth: 0 },
  label: { ...type.body, fontWeight: '600' },
  labelOn: { color: colors.teal },
  english: { ...type.caption, marginTop: 2 },
  footer: {
    padding: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
