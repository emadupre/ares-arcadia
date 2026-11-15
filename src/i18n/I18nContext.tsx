import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'es';

interface I18nContextValue {
  lang: AppLanguage;
  setLang: (next: AppLanguage) => void;
  toggleLang: () => void;
  t: (en: string, es: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  toggleLang: () => {},
  t: (en) => en,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<AppLanguage>('en');

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === 'en' ? 'es' : 'en'));
  }, []);

  const t = useCallback(
    (en: string, es: string) => (lang === 'en' ? en : es),
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, toggleLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
