'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import en from '@/lib/i18n/en';
import si from '@/lib/i18n/si';

const DICTS = { en, si };
const STORAGE_KEY = 'gth_lang';

const LanguageContext = createContext(null);

function interpolate(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');

  // Hydrate saved choice on the client (default 'en' on the server).
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved === 'si' || saved === 'en') setLangState(saved);
  }, []);

  const setLang = useCallback((l) => {
    setLangState(l);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, l);
  }, []);

  // t(key, vars?) → translated string with {placeholder} interpolation.
  // Falls back to English, then the key itself.
  const t = useCallback(
    (key, vars) => {
      const dict = DICTS[lang] || en;
      const val = dict[key] != null ? dict[key] : (en[key] != null ? en[key] : key);
      return interpolate(val, vars);
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT must be used within a LanguageProvider');
  return ctx;
}
