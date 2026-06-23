'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

function SettingsView() {
  const { token } = useAuth();
  const { t } = useT();
  const [interest, setInterest] = useState('');
  const [maxInst, setMaxInst] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const rows = res?.data || [];
        const get = (k, fb) => { const v = rows.find((c) => c.key === k)?.value; return v != null ? v : fb; };
        setInterest(String(get('installment_interest_percent', 10)));
        setMaxInst(String(get('max_installments', 12)));
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [token]);

  const putConfig = async (key, value) => {
    const r = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Save failed'); }
  };

  const save = async (e) => {
    e.preventDefault();
    setError(''); setSaved(false);
    const ip = Number(interest);
    const mx = parseInt(maxInst, 10);
    if (!(ip >= 0)) return setError(t('settings.err_interest'));
    if (!(mx >= 1)) return setError(t('settings.err_max'));
    try {
      setSaving(true);
      await putConfig('installment_interest_percent', ip);
      await putConfig('max_installments', mx);
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

      <form onSubmit={save} className="bg-white rounded-lg shadow p-6 space-y-5">
        <div>
          <label htmlFor="interest" className="block text-sm font-medium text-gray-700 mb-1">{t('settings.interest')}</label>
          <input type="number" id="interest" min="0" step="0.1" value={interest}
            onChange={(e) => { setInterest(e.target.value); setSaved(false); }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg" />
          <p className="mt-1 text-xs text-gray-500">{t('settings.interest_hint')}</p>
        </div>
        <div>
          <label htmlFor="maxInst" className="block text-sm font-medium text-gray-700 mb-1">{t('settings.max')}</label>
          <input type="number" id="maxInst" min="1" step="1" value={maxInst}
            onChange={(e) => { setMaxInst(e.target.value); setSaved(false); }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg" />
          <p className="mt-1 text-xs text-gray-500">{t('settings.max_hint')}</p>
        </div>
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
