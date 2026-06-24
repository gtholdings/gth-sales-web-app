'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

// Numeric settings, grouped into sections. key = app_config key.
const NUMERIC_SECTIONS = [
  {
    titleKey: 'settings.section_plan',
    fields: [
      { key: 'installment_interest_percent', labelKey: 'settings.interest', hintKey: 'settings.interest_hint', min: 0, step: 0.1, fallback: 10 },
      { key: 'max_installments', labelKey: 'settings.max', hintKey: 'settings.max_hint', min: 1, step: 1, fallback: 12 },
    ],
  },
  {
    titleKey: 'settings.section_reminders',
    fields: [
      { key: 'default_days_threshold', labelKey: 'settings.threshold', hintKey: 'settings.threshold_hint', min: 1, step: 1, fallback: 30 },
      { key: 'reminder_days_before', labelKey: 'settings.remind_before', hintKey: 'settings.remind_before_hint', min: 0, step: 1, fallback: 7 },
      { key: 'overdue_days_after', labelKey: 'settings.overdue_after', hintKey: 'settings.overdue_after_hint', min: 0, step: 1, fallback: 1 },
      { key: 'number_of_failed_retry_attempts', labelKey: 'settings.retry', hintKey: 'settings.retry_hint', min: 1, step: 1, fallback: 3 },
    ],
  },
];
const ALL_NUMERIC = NUMERIC_SECTIONS.flatMap((s) => s.fields);

const INPUT_CLS = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';

// Module-scope so inputs don't remount (and lose focus) on each keystroke.
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-5">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function SettingsView() {
  const { token } = useAuth();
  const { t } = useT();
  const [vals, setVals] = useState({});        // { key: stringValue } for numeric + smtp text
  const [pwd, setPwd] = useState('');          // new Gmail App Password (blank = keep)
  const [pwdSet, setPwdSet] = useState(false); // is a password already saved?
  const [financeIds, setFinanceIds] = useState([]);
  const [creditOfficers, setCreditOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [cfgRes, usersRes] = await Promise.all([
          fetch('/api/admin/config', { headers: authH() }),
          fetch('/api/admin/users', { headers: authH() }),
        ]);
        const cfg = cfgRes.ok ? await cfgRes.json() : { data: [] };
        if (cancelled) return;
        const rows = cfg.data || [];
        const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        const next = {};
        for (const f of ALL_NUMERIC) next[f.key] = String(byKey[f.key] ?? f.fallback);
        next.smtp_user = String(byKey.smtp_user ?? '');
        next.smtp_from_name = String(byKey.smtp_from_name ?? 'GT Sales');
        setVals(next);
        setPwdSet(!!cfg.smtp_app_password_set);
        setFinanceIds(Array.isArray(byKey.notification_recipients_finance) ? byKey.notification_recipients_finance : []);

        if (usersRes.ok) {
          const users = (await usersRes.json()).users || [];
          setCreditOfficers(users.filter((u) => u.role === 'credit_officer' && u.status === 'active'));
        }
      } catch { if (!cancelled) setError(t('settings.err_load')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, authH, t]);

  const setVal = (key, value) => { setVals((p) => ({ ...p, [key]: value })); setSaved(false); };
  const toggleFinance = (id) => {
    setSaved(false);
    setFinanceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const putConfig = async (key, value) => {
    const r = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authH() },
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Save failed'); }
  };

  const save = async (e) => {
    e.preventDefault();
    setError(''); setSaved(false);
    // Validate numerics.
    for (const f of ALL_NUMERIC) {
      const n = Number(vals[f.key]);
      if (!Number.isFinite(n) || n < f.min) return setError(t('settings.err_numeric', { field: t(f.labelKey), min: f.min }));
    }
    if (pwd && pwd.length < 8) return setError(t('settings.err_password'));

    try {
      setSaving(true);
      for (const f of ALL_NUMERIC) await putConfig(f.key, Number(vals[f.key]));
      await putConfig('smtp_user', String(vals.smtp_user || '').trim());
      await putConfig('smtp_from_name', String(vals.smtp_from_name || '').trim() || 'GT Sales');
      await putConfig('notification_recipients_finance', financeIds);
      if (pwd.trim()) { await putConfig('smtp_app_password', pwd.trim()); setPwd(''); setPwdSet(true); }
      setSaved(true);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('settings.title')}</h1>
        <p className="text-gray-600 mt-2">{t('settings.subtitle')}</p>
      </div>

      {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}
      {saved && <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">{t('settings.saved')}</div>}

      <form onSubmit={save} className="space-y-6">
        {NUMERIC_SECTIONS.map((sec) => (
          <Section key={sec.titleKey} title={t(sec.titleKey)}>
            {sec.fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={f.key} className="block text-sm font-medium text-gray-700 mb-1">{t(f.labelKey)}</label>
                <input type="number" id={f.key} min={f.min} step={f.step} value={vals[f.key] ?? ''}
                  onChange={(e) => setVal(f.key, e.target.value)} className={`${INPUT_CLS} text-lg`} />
                <p className="mt-1 text-xs text-gray-500">{t(f.hintKey)}</p>
              </div>
            ))}
          </Section>
        ))}

        {/* Email (Gmail SMTP) */}
        <Section title={t('settings.section_email')}>
          <p className="text-xs text-gray-500 -mt-2">{t('settings.email_intro')}</p>
          <div>
            <label htmlFor="smtp_user" className="block text-sm font-medium text-gray-700 mb-1">{t('settings.smtp_user')}</label>
            <input type="email" id="smtp_user" value={vals.smtp_user ?? ''} placeholder="yourname@gmail.com"
              onChange={(e) => setVal('smtp_user', e.target.value)} className={INPUT_CLS} autoComplete="off" />
            <p className="mt-1 text-xs text-gray-500">{t('settings.smtp_user_hint')}</p>
          </div>
          <div>
            <label htmlFor="smtp_pwd" className="block text-sm font-medium text-gray-700 mb-1">{t('settings.smtp_password')}</label>
            <input type="password" id="smtp_pwd" value={pwd} placeholder={pwdSet ? '••••••••••••••••' : ''}
              onChange={(e) => { setPwd(e.target.value); setSaved(false); }} className={INPUT_CLS} autoComplete="new-password" />
            <p className="mt-1 text-xs text-gray-500">{t('settings.smtp_password_hint')} {pwdSet && t('settings.smtp_password_set')}</p>
          </div>
          <div>
            <label htmlFor="smtp_from_name" className="block text-sm font-medium text-gray-700 mb-1">{t('settings.smtp_from_name')}</label>
            <input type="text" id="smtp_from_name" value={vals.smtp_from_name ?? ''}
              onChange={(e) => setVal('smtp_from_name', e.target.value)} className={INPUT_CLS} />
            <p className="mt-1 text-xs text-gray-500">{t('settings.smtp_from_name_hint')}</p>
          </div>
        </Section>

        {/* Finance notification recipients */}
        <Section title={t('settings.section_finance')}>
          <p className="text-xs text-gray-500 -mt-2">{t('settings.finance_recipients_hint')}</p>
          {creditOfficers.length === 0 ? (
            <p className="text-sm text-gray-500">{t('settings.finance_none')}</p>
          ) : (
            <ul className="space-y-2">
              {creditOfficers.map((co) => (
                <li key={co.id}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={financeIds.includes(co.id)} onChange={() => toggleFinance(co.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-800">{co.full_name} <span className="text-gray-400">· {co.phone}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {financeIds.length === 0 && <p className="text-xs text-amber-600">{t('settings.finance_all')}</p>}
        </Section>

        <button type="submit" disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-6 rounded-lg transition-colors">
          {saving ? t('common.saving') : t('settings.save')}
        </button>
      </form>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <SettingsView />
      </div>
    </ProtectedRoute>
  );
}
