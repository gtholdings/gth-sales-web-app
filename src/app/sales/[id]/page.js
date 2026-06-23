'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { InstallmentStatusBadge } from '@/components/InstallmentStatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { useAppConfig } from '@/lib/useAppConfig';
import { formatRs } from '@/lib/format';
import { splitInstallmentAmounts, installmentDueDates, totalRepayable } from '@/lib/installments';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' }) : '';

function SaleDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { user, token } = useAuth();
  const { t } = useT();
  const { interestPercent, maxInstallments } = useAppConfig();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [appForm, setAppForm] = useState({ number_of_installments: 3, base_amount: '', down_payment_date: '', notes: '' });
  const [commentText, setCommentText] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`/api/sales/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to load sale');
      }
      const json = await res.json();
      setData(json);
      // Pre-fill the approval panel with the rep's proposed plan.
      const s = json.sale;
      if (s?.status === 'pending') {
        setAppForm((p) => ({
          ...p,
          number_of_installments: s.proposed_num_installments || s.num_installments || p.number_of_installments,
          base_amount: (s.proposed_base_amount ?? s.base_amount) != null ? String(s.proposed_base_amount ?? s.base_amount) : p.base_amount,
          down_payment_date: s.proposed_down_payment_date || s.down_payment_date || p.down_payment_date,
        }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  // Reps can finalize (install + collect down payment on) their OWN sale; the
  // server scope-check guarantees a rep only ever sees/acts on their own sales.
  const canApprove = ['rep', 'supervisor', 'manager', 'admin'].includes(user?.role);
  const canClaim = ['rep', 'supervisor', 'manager', 'admin'].includes(user?.role);
  const canConfirm = ['credit_officer', 'admin'].includes(user?.role);
  const isReadOnly = user?.role === 'field_officer'; // cross-team viewer, comments only

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const post = async (url, bodyObj) => {
    const res = await fetch(url, { method: 'POST', headers: authHeaders, body: JSON.stringify(bodyObj) });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Request failed');
    }
    return res.json();
  };

  const submitApproval = (action) => {
    const note = appForm.notes.trim();
    if (!note) { setError(t('detail.comment_required')); return; }
    if (action === 'approve' && Number(appForm.number_of_installments) > maxInstallments) {
      setError(t('form.err_max_installments', { max: maxInstallments })); return;
    }
    act(async () => {
      const body = action === 'approve'
        ? {
            action: 'approve',
            number_of_installments: Number(appForm.number_of_installments),
            base_amount: Number(appForm.base_amount || 0),
            down_payment_date: appForm.down_payment_date,
            notes: note,
          }
        : { action: 'reject', notes: note };
      await post(`/api/sales/${id}/approve`, body);
    });
  };

  // Claim ("mark paid") and finance confirm/reject all require a comment.
  const withComment = (fn) => {
    const note = prompt(t('detail.comment_prompt'));
    if (note == null) return;                 // cancelled
    if (!note.trim()) { setError(t('detail.comment_required')); return; }
    fn(note.trim());
  };
  const claim = (instId) => withComment((note) => act(() => post(`/api/sales/${id}/installments/${instId}/claim`, { note })));
  const confirm = (instId, action) => withComment((note) => act(() => post(`/api/sales/${id}/installments/${instId}/confirm`, { action, note })));
  const addItemComment = (instId, note) => act(() => post(`/api/sales/${id}/comments`, { note, installment_id: instId }));
  const addSaleComment = () => act(async () => { await post(`/api/sales/${id}/comments`, { note: commentText }); setCommentText(''); });

  // Shared per-installment action buttons (used by the desktop table + mobile cards).
  const itemActions = (it) => (
    <div className="flex gap-2 flex-wrap">
      {canClaim && it.display_status !== 'paid' && it.display_status !== 'awaiting_confirmation' && (
        <button disabled={busy} onClick={() => claim(it.id)}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1 rounded text-xs font-medium">
          {t('detail.mark_paid')}
        </button>
      )}
      {it.display_status === 'awaiting_confirmation' && canConfirm && (
        <>
          <button disabled={busy} onClick={() => confirm(it.id, 'confirm')}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1 rounded text-xs font-medium">
            {t('detail.confirm')}
          </button>
          <button disabled={busy} onClick={() => confirm(it.id, 'reject')}
            className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-3 py-1 rounded text-xs font-medium">
            {t('detail.reject_payment')}
          </button>
        </>
      )}
      <button disabled={busy}
        onClick={() => { const note = prompt(t('detail.comment_prompt')); if (note && note.trim()) addItemComment(it.id, note.trim()); }}
        className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-xs font-medium">
        {t('detail.comment')}
      </button>
    </div>
  );

  const itemMeta = (it) => (
    <div className="text-gray-600 text-xs space-y-0.5">
      {it.paid_date && <div>{t('detail.paid_on', { date: fmtDate(it.paid_date) })}</div>}
      {it.claimed_by_name && it.display_status === 'awaiting_confirmation' && <div>{t('detail.claimed_by', { name: it.claimed_by_name })}</div>}
      {it.confirmed_by_name && <div>{t('detail.confirmed_by', { name: it.confirmed_by_name })}</div>}
      {it.finance_note && <div className="italic">“{it.finance_note}”</div>}
    </div>
  );

  const itemTitle = (it) => (it.is_base ? t('detail.down_payment_row') : t('detail.installment_n', { n: it.installment_number }));

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 rounded-lg p-4">{error}</div>
        <button onClick={() => router.push('/sales')} className="mt-4 text-blue-600 hover:underline">{t('common.back_to_sales')}</button>
      </div>
    );
  }

  const { sale, installments, events } = data;

  // Live, read-only preview for the approval panel — recomputes as the
  // supervisor edits the down-payment amount, date, or installment count.
  const apTotal = Number(sale.total_amount) || 0;
  const apDown = parseFloat(appForm.base_amount) || 0;
  const apLoan = Math.max(Math.round((apTotal - apDown) * 100) / 100, 0);
  const apN = parseInt(appForm.number_of_installments, 10) || 0;
  const apRepay = apLoan > 0 && apN > 0 ? totalRepayable(apLoan, apN, interestPercent) : 0;
  const apInterest = Math.round((apRepay - apLoan) * 100) / 100;
  const apAmounts = apLoan > 0 && apN > 0 ? splitInstallmentAmounts(apRepay, apN) : [];
  const apMonthly = apAmounts.length ? apAmounts[0] : 0;
  const apDueDates = appForm.down_payment_date && apN > 0 ? installmentDueDates(appForm.down_payment_date, apN) : [];

  // Collectible summary for an already-approved sale (sum of all payable rows).
  const collectibleTotal = installments.reduce((s, i) => s + Number(i.amount || 0), 0);
  const interestTotal = Math.round((collectibleTotal - apTotal) * 100) / 100;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.push('/sales')} className="text-blue-600 hover:underline text-sm mb-4">{t('common.back_to_sales')}</button>

      {error && <div className="mb-4 bg-red-100 border border-red-400 text-red-700 rounded-lg p-3">{error}</div>}

      {/* Field Officer: read-only notice — changes must be made by the owning team */}
      {isReadOnly && (
        <div className="mb-4 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg p-3 text-sm">
          {t('detail.field_officer_notice')}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{sale.customer_name}</h1>
            <p className="text-gray-600 text-sm mt-1">NIC {sale.nic_number} · {sale.personal_phone}</p>
            <p className="text-gray-600 text-sm">{sale.permanent_address}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{formatRs(sale.total_amount)}</div>
            <div className="text-sm text-gray-600">{t(`payment_type.${sale.payment_type}`)} · {t(`sale_status.${sale.status}`)}</div>
            {collectibleTotal > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {t('detail.collectible_label', { amount: formatRs(collectibleTotal), interest: formatRs(interestTotal) })}
              </div>
            )}
            {sale.rep?.full_name && <div className="text-xs text-gray-500 mt-1">{t('detail.rep_label', { name: sale.rep.full_name })}</div>}
            {sale.approver?.full_name && <div className="text-xs text-gray-500">{t('detail.approved_by', { name: sale.approver.full_name, date: fmtDate(sale.approved_at) })}</div>}
          </div>
        </div>
      </div>

      {/* Approval panel — supervisor collects down payment + activates */}
      {sale.status === 'pending' && canApprove && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{t('detail.collect_title')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('detail.collect_subtitle')}</p>
          {sale.proposed_down_payment_date && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded p-2 mb-4">
              {t('detail.proposed_label', {
                count: sale.proposed_num_installments,
                amount: formatRs(sale.proposed_base_amount),
                date: fmtDate(sale.proposed_down_payment_date),
              })}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('detail.num_installments')}</label>
              <input type="number" min="1" max={maxInstallments} value={appForm.number_of_installments}
                onChange={(e) => setAppForm((p) => ({ ...p, number_of_installments: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <p className="mt-1 text-xs text-gray-500">{t('form.max_installments_hint', { max: maxInstallments })}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('detail.down_payment_amount')}</label>
              <input type="number" min="0" step="0.01" value={appForm.base_amount}
                onChange={(e) => setAppForm((p) => ({ ...p, base_amount: e.target.value }))}
                placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('detail.down_payment_date')}</label>
              <input type="date" value={appForm.down_payment_date}
                onChange={(e) => setAppForm((p) => ({ ...p, down_payment_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>

          {/* Live read-only recalculation (includes configured interest) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">{t('detail.loan_amount')}</div>
              <div className="font-semibold text-gray-900">{formatRs(apLoan)}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">{t('form.interest')}</div>
              <div className="font-semibold text-gray-900">{apInterest ? formatRs(apInterest) : '—'}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">{t('detail.monthly')}</div>
              <div className="font-semibold text-gray-900">{apMonthly ? formatRs(apMonthly) : '—'}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">{t('form.total_collectible')}</div>
              <div className="font-semibold text-gray-900">{apDown + apRepay ? formatRs(apDown + apRepay) : '—'}</div>
            </div>
          </div>
          {apDueDates.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
              <div className="bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">{t('detail.schedule_preview')}</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-t border-gray-100 bg-blue-50/40">
                    <td className="px-4 py-2 text-gray-700">{t('detail.down_payment_row')}</td>
                    <td className="px-4 py-2 text-gray-900">{fmtDate(appForm.down_payment_date)}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{formatRs(apDown)}</td>
                  </tr>
                  {apDueDates.map((d, i) => (
                    <tr key={d + i} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-700">{t('detail.installment_n', { n: i + 1 })}</td>
                      <td className="px-4 py-2 text-gray-900">{fmtDate(d)}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">{formatRs(apAmounts[i])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <textarea value={appForm.notes} onChange={(e) => setAppForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder={t('detail.comment_field')} rows="2" required className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4" />
          <div className="flex gap-3">
            <button disabled={busy} onClick={() => submitApproval('approve')}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium px-5 py-2 rounded-lg">
              {busy ? t('common.working') : t('detail.approve')}
            </button>
            <button disabled={busy} onClick={() => submitApproval('reject')}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium px-5 py-2 rounded-lg">
              {t('detail.reject')}
            </button>
          </div>
        </div>
      )}

      {/* Payables */}
      {installments.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <h2 className="text-lg font-bold text-gray-900 p-4 border-b border-gray-200">{t('detail.payments')}</h2>

          {/* Desktop / tablet table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('detail.col_payment')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('detail.col_due')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('common.amount')}</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">{t('common.status')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('detail.col_paid_confirmed')}</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((it) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className="px-4 py-3 font-medium text-gray-900">{itemTitle(it)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtDate(it.due_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatRs(it.amount)}</td>
                    <td className="px-4 py-3 text-center"><InstallmentStatusBadge status={it.display_status} /></td>
                    <td className="px-4 py-3">{itemMeta(it)}</td>
                    <td className="px-4 py-3"><div className="flex justify-center">{itemActions(it)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-gray-100">
            {installments.map((it) => (
              <li key={it.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{itemTitle(it)}</p>
                    <p className="text-xs text-gray-500">{t('detail.col_due')}: {fmtDate(it.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{formatRs(it.amount)}</div>
                    <div className="mt-1"><InstallmentStatusBadge status={it.display_status} /></div>
                  </div>
                </div>
                <div className="mt-2">{itemMeta(it)}</div>
                <div className="mt-2">{itemActions(it)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity timeline */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">{t('detail.activity')}</h2>
        <div className="flex gap-2 mb-5">
          <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
            placeholder={t('detail.add_comment')} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
          <button disabled={busy || !commentText.trim()} onClick={addSaleComment}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-medium">
            {t('common.post')}
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('detail.no_activity')}</p>
        ) : (
          <ul className="space-y-3">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="border-l-2 border-gray-200 pl-3">
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{e.author_name}</span>{' '}
                  <span className="text-gray-500">{e.event_type === 'amend' ? t('event.amend') : e.event_type.replace('_', ' ')}</span>
                  {e.amount != null && <span className="text-gray-700"> · {formatRs(e.amount)}</span>}
                </div>
                {e.note && <div className="text-sm text-gray-700">{e.note}</div>}
                <div className="text-xs text-gray-400">{fmtDateTime(e.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function SaleDetailPage() {
  return (
    <ProtectedRoute allowedRoles={['any']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <SaleDetail />
      </div>
    </ProtectedRoute>
  );
}
