'use client';

import { useT } from '@/contexts/LanguageContext';

// Language dropdown (English / සිංහල). Switches instantly, persists to localStorage.
export function LanguageSwitcher({ className = '' }) {
  const { lang, setLang } = useT();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value)}
      aria-label="Language"
      className={`text-sm rounded-md border border-gray-300 bg-white text-gray-800 px-2 py-1 ${className}`}
    >
      <option value="en">English</option>
      <option value="si">සිංහල</option>
    </select>
  );
}
