'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

const ROLES = ['rep', 'supervisor', 'manager', 'admin', 'credit_officer', 'field_officer'];
const STATUSES = ['active', 'pending', 'inactive'];

const emptyForm = { full_name: '', phone: '', email: '', password: '', role: 'rep', reports_to: '', status: 'active' };

function AdminUsers() {
  const { token, user: me } = useAuth();
  const { t } = useT();

  const [users, setUsers] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [managers, setManagers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', id? }
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setUsers((await res.json()).users || []);
      else setError(t('admin.err_load'));
    } catch { setError(t('admin.err_load')); }
    finally { setIsLoading(false); }
  }, [token, t]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const auth = { headers: { Authorization: `Bearer ${token}` } };
        const [s, m] = await Promise.all([fetch('/api/profiles/supervisors', auth), fetch('/api/profiles/managers', auth)]);
        if (s.ok) setSupervisors((await s.json()).supervisors || []);
        if (m.ok) setManagers((await m.json()).managers || []);
      } catch { /* non-fatal */ }
    })();
  }, [token]);

  // reps report to a supervisor; supervisors to a manager; others have no parent.
  const parentOptionsFor = (role) => {
    if (role === 'rep') return { label: t('admin.select_supervisor'), options: supervisors };
    if (role === 'supervisor') return { label: t('admin.select_manager'), options: managers };
    return null;
  };

  const setField = (field, value) =>
    setForm((p) => ({ ...p, [field]: value, ...(field === 'role' ? { reports_to: '' } : {}) }));

  const openCreate = () => { setError(''); setNotice(''); setForm(emptyForm); setModal({ mode: 'create' }); };
  const openEdit = (u) => {
    setError(''); setNotice('');
    setForm({
      full_name: u.full_name || '', phone: u.phone || '', email: u.email || '',
      password: '', role: u.role, reports_to: u.reports_to || '', status: u.status,
    });
    setModal({ mode: 'edit', id: u.id, phone: u.phone });
  };
  const closeModal = () => { if (!busy) setModal(null); };

  const submit = async () => {
    setError('');
    if (!form.full_name.trim()) return setError(t('admin.err_name'));
    if (!/^07\d{8}$/.test(form.phone.trim())) return setError(t('register.err_mobile_format'));
    if (modal.mode === 'create' && form.password.length < 6) return setError(t('admin.err_password'));
    if (modal.mode === 'edit' && form.password && form.password.length < 6) return setError(t('admin.err_password'));

    const needsParent = form.role === 'rep' || form.role === 'supervisor';
    const reports_to = needsParent ? form.reports_to || null : null;

    setBusy(true);
    try {
      let res;
      if (modal.mode === 'create') {
        res = await fetch('/api/admin/users', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({
            full_name: form.full_name.trim(), phone: form.phone.trim(),
            email: form.email.trim() || null, password: form.password,
            role: form.role, reports_to,
          }),
        });
      } else {
        const payload = {
          full_name: form.full_name.trim(), email: form.email.trim() || null,
          role: form.role, reports_to, status: form.status,
        };
        if (form.phone.trim() !== modal.phone) payload.phone = form.phone.trim();
        if (form.password) payload.password = form.password;
        res = await fetch(`/api/admin/users/${modal.id}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify(payload) });
      }
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || t('admin.err_save')); return; }
      setNotice(modal.mode === 'create' ? t('admin.created') : t('admin.updated'));
      setModal(null);
      await loadUsers();
    } catch { setError(t('admin.err_save')); }
    finally { setBusy(false); }
  };

  const removeUser = async (u) => {
    setError(''); setNotice('');
    if (!window.confirm(t('admin.delete_confirm', { name: u.full_name }))) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || t('admin.err_delete')); return; }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setNotice(t('admin.deleted'));
    } catch { setError(t('admin.err_delete')); }
  };

  const shown = users.filter((u) => statusFilter === 'all' || u.status === statusFilter);
  const statusStyles = {
    active: 'bg-green-100 text-green-800', pending: 'bg-yellow-100 text-yellow-800', inactive: 'bg-gray-200 text-gray-700',
  };
  const parentOpts = parentOptionsFor(form.role);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('admin.title')}</h1>
          <p className="text-gray-600 mt-2">{t('admin.subtitle')}</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg">
          + {t('admin.add_user')}
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}
      {notice && <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">{notice}</div>}

      {/* Status filter */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span className="text-gray-600">{t('admin.filter_status')}:</span>
        {['all', ...STATUSES].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full font-medium ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {s === 'all' ? t('admin.all_statuses') : t('admin.status_' + s)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center"><p className="text-gray-500 text-lg">{t('admin.no_users')}</p></div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_name')}</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_phone')}</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_email')}</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_role')}</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_reports_to')}</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">{t('admin.col_status')}</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{u.full_name}{u.id === me?.id && <span className="ml-2 text-xs text-blue-600">({t('admin.you')})</span>}</td>
                    <td className="px-6 py-4 text-gray-700">{u.phone}</td>
                    <td className="px-6 py-4 text-gray-700">{u.email || '—'}</td>
                    <td className="px-6 py-4"><span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">{t('role.' + u.role)}</span></td>
                    <td className="px-6 py-4 text-gray-700">{u.reports_to_name || '—'}</td>
                    <td className="px-6 py-4 text-center"><span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusStyles[u.status] || statusStyles.inactive}`}>{t('admin.status_' + u.status)}</span></td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => openEdit(u)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-xs font-medium">{t('admin.edit')}</button>
                        <button onClick={() => removeUser(u)} disabled={u.id === me?.id} className="bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs font-medium">{t('admin.delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-gray-100">
            {shown.map((u) => (
              <li key={u.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{u.full_name}{u.id === me?.id && <span className="ml-2 text-xs text-blue-600">({t('admin.you')})</span>}</p>
                    <p className="text-xs text-gray-500">{u.phone}{u.email ? ` · ${u.email}` : ''}</p>
                  </div>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[u.status] || statusStyles.inactive}`}>{t('admin.status_' + u.status)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-medium">{t('role.' + u.role)}</span>
                  {u.reports_to_name && <span>→ {u.reports_to_name}</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => openEdit(u)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded text-sm font-medium">{t('admin.edit')}</button>
                  <button onClick={() => removeUser(u)} disabled={u.id === me?.id} className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-red-200 text-white px-3 py-2 rounded text-sm font-medium">{t('admin.delete')}</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">{t('sales.showing', { n: shown.length, total: users.length })}</div>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={closeModal}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{modal.mode === 'create' ? t('admin.create_user') : t('admin.edit_user')}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.col_name')} *</label>
                <input value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.col_phone')} *</label>
                  <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="0771234567" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.col_email')}</label>
                  <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.field_password')} {modal.mode === 'create' ? '*' : ''}</label>
                <input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} autoComplete="new-password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                <p className="mt-1 text-xs text-gray-500">{modal.mode === 'create' ? t('admin.password_hint_create') : t('admin.password_hint_edit')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.col_role')} *</label>
                  <select value={form.role} onChange={(e) => setField('role', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    {ROLES.map((r) => <option key={r} value={r}>{t('role.' + r)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.col_status')}</label>
                  <select value={form.status} onChange={(e) => setField('status', e.target.value)} disabled={modal.mode === 'create'} className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100">
                    {STATUSES.map((s) => <option key={s} value={s}>{t('admin.status_' + s)}</option>)}
                  </select>
                  {modal.mode === 'create' && <p className="mt-1 text-xs text-gray-500">{t('admin.status_create_hint')}</p>}
                </div>
              </div>
              {parentOpts ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.col_reports_to')}</label>
                  <select value={form.reports_to} onChange={(e) => setField('reports_to', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="">{parentOpts.label}</option>
                    {parentOpts.options.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-gray-500">{t('admin.no_parent_for_role')}</p>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-4 flex gap-3 justify-end">
              <button onClick={closeModal} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">{t('common.cancel')}</button>
              <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium">
                {busy ? t('common.saving') : modal.mode === 'create' ? t('admin.create_user') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function AdminPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <AdminUsers />
      </div>
    </ProtectedRoute>
  );
}
