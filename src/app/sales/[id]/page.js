'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { InstallmentStatusBadge } from '@/components/InstallmentStatusBadge';
import { useAuth } from '@/contexts/AuthContext';

const lkr = (n) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(Number(n || 0));
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' }) : '';

function SaleDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { user, token } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Approval form
  const [appForm, setAppForm] = useState({ number_of_installments: 3, base_amount: '', first_due_date: '', notes: '' });
  // Per-item comment + sale-level comment
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
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const canApprove = ['team_lead', 'manager', 'admin'].includes(user?.role);
  const canConfirm = ['finance', 'admin'].includes(user?.role);

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

  const submitApproval = (action) => act(async () => {
    const body = action === 'approve'
      ? {
          action: 'approve',
          number_of_installments: Number(appForm.number_of_installments),
          base_amount: Number(appForm.base_amount || 0),
          first_due_date: appForm.first_due_date,
          notes: appForm.notes || undefined,
        }
      : { action: 'reject', notes: appForm.notes || undefined };
    await post(`/api/sales/${id}/approve`, body);
  });

  const claim = (instId) => act(() => post(`/api/sales/${id}/installments/${instId}/claim`, {}));
  const confirm = (instId, action) => act(() => post(`/api/sales/${id}/installments/${instId}/confirm`, { action }));
  const addItemComment = (instId, note) => act(() => post(`/api/sales/${id}/comments`, { note, installment_id: instId }));
  const addSaleComment = () => act(async () => { await post(`/api/sales/${id}/comments`, { note: commentText }); setCommentText(''); });

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
        <button onClick={() => router.push('/sales')} className="mt-4 text-blue-600 hover:underline">← Back to sales</button>
      </div>
    );
  }

  const { sale, installments, events } = data;
  const isInstallment = sale.payment_type === 'installment';

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.push('/sales')} className="text-blue-600 hover:underline text-sm mb-4">← Back to sales</button>

      {error && <div className="mb-4 bg-red-100 border border-red-400 text-red-700 rounded-lg p-3">{error}</div>}

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{sale.customer_name}</h1>
            <p className="text-gray-600 text-sm mt-1">NIC {sale.nic_number} · {sale.personal_phone}</p>
            <p className="text-gray-600 text-sm">{sale.permanent_address}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{lkr(sale.total_amount)}</div>
            <div className="text-sm text-gray-600 capitalize">{sale.payment_type} · {sale.status}</div>
            {sale.rep?.full_name && <div className="text-xs text-gray-500 mt-1">Rep: {sale.rep.full_name}</div>}
            {sale.approver?.full_name && <div className="text-xs text-gray-500">Approved by {sale.approver.full_name} · {fmtDate(sale.approved_at)}</div>}
          </div>
        </div>
      </div>

      {/* Approval panel */}
      {sale.status === 'pending' && canApprove && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Approve sale</h2>
          {isInstallment ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of installments</label>
                <input type="number" min="1" value={appForm.number_of_installments}
                  onChange={(e) => setAppForm((p) => ({ ...p, number_of_installments: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base / down payment (LKR)</label>
                <input type="number" min="0" step="0.01" value={appForm.base_amount}
                  onChange={(e) => setAppForm((p) => ({ ...p, base_amount: e.target.value }))}
                  placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First due date</label>
                <input type="date" value={appForm.first_due_date}
                  onChange={(e) => setAppForm((p) => ({ ...p, first_due_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 mb-4">Full payment — a single payable of {lkr(sale.total_amount)} will be created for finance to confirm.</p>
          )}
          <textarea value={appForm.notes} onChange={(e) => setAppForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Notes (optional)" rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4" />
          <div className="flex gap-3">
            <button disabled={busy} onClick={() => submitApproval('approve')}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium px-5 py-2 rounded-lg">
              {busy ? 'Working…' : 'Approve'}
            </button>
            <button disabled={busy} onClick={() => submitApproval('reject')}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium px-5 py-2 rounded-lg">
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Payables */}
      {installments.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <h2 className="text-lg font-bold text-gray-900 p-4 border-b border-gray-200">Payments</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Payment</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Due</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Paid / Confirmed</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((it) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {it.is_base ? 'Down Payment' : `Installment ${it.installment_number}`}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtDate(it.due_date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{lkr(it.amount)}</td>
                    <td className="px-4 py-3 text-center"><InstallmentStatusBadge status={it.display_status} /></td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {it.paid_date && <div>Paid {fmtDate(it.paid_date)}</div>}
                      {it.claimed_by_name && it.display_status === 'awaiting_confirmation' && <div>Claimed by {it.claimed_by_name}</div>}
                      {it.confirmed_by_name && <div>Confirmed by {it.confirmed_by_name}</div>}
                      {it.finance_note && <div className="italic">“{it.finance_note}”</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-center flex-wrap">
                        {it.display_status !== 'paid' && it.display_status !== 'awaiting_confirmation' && (
                          <button disabled={busy} onClick={() => claim(it.id)}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1 rounded text-xs font-medium">
                            Mark paid
                          </button>
                        )}
                        {it.display_status === 'awaiting_confirmation' && canConfirm && (
                          <>
                            <button disabled={busy} onClick={() => confirm(it.id, 'confirm')}
                              className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1 rounded text-xs font-medium">
                              Confirm
                            </button>
                            <button disabled={busy} onClick={() => confirm(it.id, 'reject')}
                              className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-3 py-1 rounded text-xs font-medium">
                              Reject
                            </button>
                          </>
                        )}
                        <button disabled={busy}
                          onClick={() => { const n = prompt('Comment on this payment:'); if (n && n.trim()) addItemComment(it.id, n.trim()); }}
                          className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-xs font-medium">
                          Comment
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Activity</h2>
        <div className="flex gap-2 mb-5">
          <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment…" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
          <button disabled={busy || !commentText.trim()} onClick={addSaleComment}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-medium">
            Post
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-gray-500 text-sm">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-gray-200 pl-3">
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{e.author_name}</span>{' '}
                  <span className="text-gray-500">{e.event_type.replace('_', ' ')}</span>
                  {e.amount != null && <span className="text-gray-700"> · {lkr(e.amount)}</span>}
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
