'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { translations, type Locale, type TranslationKey } from './translations';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'glimmer_locale';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh-TW');
  const [mounted, setMounted] = useState(false);

  // Load saved locale on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && (saved === 'zh-TW' || saved === 'en')) {
      setLocaleState(saved);
    } else {
      // Detect browser language
      const browserLang = navigator.language;
      if (browserLang.startsWith('en')) {
        setLocaleState('en');
      }
    }
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    // Update html lang attribute
    document.documentElement.lang = newLocale === 'zh-TW' ? 'zh-Hant' : 'en';
  }, []);

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    let text: string = translations[locale][key] || translations['zh-TW'][key] || key;

    // Replace parameters like {count}, {n}, etc.
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
      });
    }

    return text;
  }, [locale]);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: 'zh-TW', setLocale, t }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function useLocale() {
  const { locale } = useI18n();
  return locale;
}

export function useTranslation() {
  const { t } = useI18n();
  return t;
}
