import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyLanguage, getStoredLanguage, i18n, storeLanguage, type LanguageCode,
} from '@/lib/i18n';

type LanguageContextType = {
  /** null until the stored choice has been read, and after that only null if none was ever made. */
  language: LanguageCode | null;
  /** False while the stored choice is still being read, so index does not flash the wrong route. */
  ready: boolean;
  setLanguage: (code: LanguageCode) => Promise<void>;
  t: (key: string, options?: Record<string, any>) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: null,
  ready: false,
  setLanguage: async () => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<LanguageCode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getStoredLanguage();
      if (stored) { applyLanguage(stored); setLang(stored); }
      setReady(true);
    })();
  }, []);

  const setLanguage = useCallback(async (code: LanguageCode) => {
    applyLanguage(code);
    setLang(code);
    await storeLanguage(code);
  }, []);

  // i18n.locale is module state, so a translated string does not change identity
  // when the language does. Keying t on `language` is what makes every consumer
  // re-render on a switch instead of holding the old copy until it happens to
  // re-render for another reason.
  const t = useCallback(
    (key: string, options?: Record<string, any>) => i18n.t(key, options),
    [language],
  );

  const value = useMemo(
    () => ({ language, ready, setLanguage, t }),
    [language, ready, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** Shorthand for the common case of only needing the translate function. */
export function useT() {
  return useContext(LanguageContext).t;
}
