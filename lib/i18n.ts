import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '@/locales/en.json';
import pl from '@/locales/pl.json';
import ro from '@/locales/ro.json';
import lt from '@/locales/lt.json';

export const LANGUAGE_KEY = 'vantro_language';

export type LanguageCode = 'en' | 'pl' | 'ro' | 'lt';

/** `label` is deliberately in the language itself: someone who cannot read the
 *  current UI language still has to be able to find their own row. */
export const LANGUAGES: { code: LanguageCode; label: string; english: string }[] = [
  { code: 'en', label: 'English', english: 'English' },
  { code: 'pl', label: 'Polski', english: 'Polish' },
  { code: 'ro', label: 'Română', english: 'Romanian' },
  { code: 'lt', label: 'Lietuvių', english: 'Lithuanian' },
];

const CODES = LANGUAGES.map(l => l.code);

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === 'string' && (CODES as string[]).includes(v);
}

export const i18n = new I18n({ en, pl, ro, lt });

i18n.defaultLocale = 'en';
i18n.enableFallback = true;
i18n.locale = 'en';

// i18n-js ships one/other, which is English's shape and wrong for three of our
// four languages: Polish "2 dni" against "5 dni" is a different form, not a
// different number. Getting this wrong reads as broken grammar to a native
// speaker, so each locale declares its own CLDR categories.

i18n.pluralization.register('pl', (_i18n, count) => {
  if (count === 1) return ['one'];
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return ['few'];
  return ['many', 'other'];
});

i18n.pluralization.register('lt', (_i18n, count) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && !(mod100 >= 11 && mod100 <= 19)) return ['one'];
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return ['few'];
  return ['other'];
});

i18n.pluralization.register('ro', (_i18n, count) => {
  if (count === 1) return ['one'];
  const mod100 = count % 100;
  if (count === 0 || (mod100 >= 1 && mod100 <= 19)) return ['few'];
  return ['other'];
});

/**
 * The device language, when we ship it. Only used to preselect a row on the
 * first run screen - we never pick silently, because a phone set to English in
 * a Polish crew is common and the installer should be the one deciding.
 */
export function deviceLanguage(): LanguageCode | null {
  try {
    for (const loc of Localization.getLocales()) {
      const code = loc.languageCode?.toLowerCase();
      if (isLanguageCode(code)) return code;
    }
  } catch {}
  return null;
}

export async function getStoredLanguage(): Promise<LanguageCode | null> {
  try {
    const raw = await AsyncStorage.getItem(LANGUAGE_KEY);
    return isLanguageCode(raw) ? raw : null;
  } catch { return null; }
}

export async function storeLanguage(code: LanguageCode): Promise<void> {
  try { await AsyncStorage.setItem(LANGUAGE_KEY, code); } catch {}
}

export function applyLanguage(code: LanguageCode) {
  i18n.locale = code;
}

export function t(key: string, options?: Record<string, any>): string {
  return i18n.t(key, options);
}
