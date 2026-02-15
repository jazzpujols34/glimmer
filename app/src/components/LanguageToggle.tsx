'use client';

import { useI18n, type Locale } from '@/lib/i18n';
import { Globe } from 'lucide-react';

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '繁中',
  en: 'EN',
};

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  const toggleLocale = () => {
    setLocale(locale === 'zh-TW' ? 'en' : 'zh-TW');
  };

  return (
    <button
      onClick={toggleLocale}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      aria-label={`Switch to ${locale === 'zh-TW' ? 'English' : '繁體中文'}`}
    >
      <Globe className="w-4 h-4" />
      <span>{LOCALE_LABELS[locale]}</span>
    </button>
  );
}
