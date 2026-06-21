'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

const lkr = (n) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(Number(n || 0));

const RANGES = [
  { value: 'MTD', label: 'Month to date' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom' },
];

function ReportsView() {
  const { token } = useAuth();
  const [filters, setFilters] = useState({ range: 'MTD', groupBy: 'month', from: '', to: '', scope: '' });
  const [report, setReport] = useState(null);
  const [defaulters, setDefaulters] = useState(null);
  const [managers, setManagers] = useState([]);
  const [teamLeads, setTeamLeads] = useState([]);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load filter dropdown sources once.
  useEffect(() => {
    (async () => {
      try {
        const [m, t, r] = await Promise.all([
          fetch('/api/profiles/managers'), fetch('/api/profiles/team-leads'), fetch('/api/profiles/reps'),
        ]);
        if (m.ok) setManagers((await m.json()).managers || []);
        if (t.ok) setTeamLeads((await t.json()).team_leads || []);
        if (r.ok) setReps((await r.json()).reps || []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  // Build the query string from filters. scope = "type:id".
  const queryString = useCallback(() => {
    const p = new URLSearchParams({ range: filters.range, groupBy: filters.groupBy });
    if (filters.range === 'custom' && filters.from && filters.to) { p.set('from', filters.from); p.set('to', filters.to); }
    if (filters.scope) {
      const [type, id] = filters.scope.split(':');
      const key = type === 'manager' ? 'managerId' : type === 'team_lead' ? 'teamLeadId' : 'repId';
      p.set(key, id);
    }
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    if (!token) return;
    if (filters.range === 'custom' && (!filters.from || !filters.to)) return; // wait for both
    try {
      setLoading(true); setError('');
      const qs = queryString();
      const [rep, def] = await Promise.all([
        fetch(`/api/sales/reports?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/sales/reports/defaulters?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (rep.ok) setReport((await rep.json()).report); else setError('Failed to load report');
      if (def.ok) setDefaulters(await def.json());
    } catch { setError('An error occurred while loading reports'); }
    finally { setLoading(false); }
  }, [token, filters, queryString]);

  useEffect(() => { load(); }, [load]);

  const exportXlsx = async (type) => {
    try {
      const qs = `${queryString()}&type=${type}`;
      const res = await fetch(`/api/sales/reports/export?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gth-${type}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  const set = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Sales Reports</h1>
        <p className="text-gray-600 mt-2">Sales, payments, and defaulters by period and scope.</p>
      </div>

      {error && <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Range</label>
          <select value={filters.range} onChange={(e) => set('range', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg">
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {filters.range === 'custom' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Group by</label>
          <select value={filters.groupBy} onChange={(e) => set('groupBy', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
            <option value="month">Month</option>
            <option value="week">Week</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Filter by</label>
          <select value={filters.scope} onChange={(e) => set('scope', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg min-w-[12rem]">
            <option value="">Everyone in my scope</option>
            {managers.length > 0 && (
              <optgroup label="Managers">
                {managers.map((m) => <option key={m.id} value={`manager:${m.id}`}>{m.full_name}</option>)}
              </optgroup>
            )}
            {teamLeads.length > 0 && (
              <optgroup label="Team Leads">
                {teamLeads.map((t) => <option key={t.id} value={`team_lead:${t.id}`}>{t.full_name}</option>)}
              </optgroup>
            )}
            {reps.length > 0 && (
              <optgroup label="Reps">
                {reps.map((r) => <option key={r.id} value={`rep:${r.id}`}>{r.full_name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <button onClick={() => exportXlsx('summary')} className="ml-auto bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg">
          Export summary
        </button>
        <button onClick={() => exportXlsx('defaulters')} className="bg-green-700 hover:bg-green-800 text-white font-medium px-4 py-2 rounded-lg">
          Export defaulters
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
      ) : (
        <>
          {/* Period report */}
          <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
            <h2 className="text-lg font-bold text-gray-900 p-4 border-b border-gray-200">By period</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Period</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700"># Sales</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Confirmed</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Cumulative</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Paid</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Awaiting</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Pending</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Defaulted</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.periods || []).length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No data for this range.</td></tr>
                  ) : report.periods.map((p) => (
                    <tr key={p.period} className="border-b border-gray-200">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.period}</td>
                      <td className="px-4 py-3 text-right">{p.num_sales}</td>
                      <td className="px-4 py-3 text-right">{lkr(p.confirmed_sale_total)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{lkr(p.cumulative_confirmed_total)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{lkr(p.amount_paid)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{lkr(p.amount_awaiting)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{lkr(p.amount_pending)}</td>
                      <td className="px-4 py-3 text-right text-red-700">{lkr(p.amount_defaulted)}</td>
                    </tr>
                  ))}
                  {report?.totals && report.periods.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{report.totals.num_sales}</td>
                      <td className="px-4 py-3 text-right">{lkr(report.totals.confirmed_sale_total)}</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right text-green-700">{lkr(report.totals.amount_paid)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{lkr(report.totals.amount_awaiting)}</td>
                      <td className="px-4 py-3 text-right">{lkr(report.totals.amount_pending)}</td>
                      <td className="px-4 py-3 text-right text-red-700">{lkr(report.totals.amount_defaulted)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Defaulters */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="text-lg font-bold text-gray-900 p-4 border-b border-gray-200">
              Defaulters {defaulters && <span className="text-sm font-normal text-gray-500">· total {lkr(defaulters.total_defaulted_amount)}</span>}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Sales Rep</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Defaulted #</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Defaulted Amount</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Oldest Due</th>
                  </tr>
                </thead>
                <tbody>
                  {(defaulters?.rows || []).length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No defaulted installments. 🎉</td></tr>
                  ) : defaulters.rows.map((r) => (
                    <tr key={r.rep_id} className="border-b border-gray-200">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.rep_name}</td>
                      <td className="px-4 py-3 text-right">{r.defaulted_count}</td>
                      <td className="px-4 py-3 text-right text-red-700 font-semibold">{lkr(r.defaulted_amount)}</td>
                      <td className="px-4 py-3 text-gray-700">{r.oldest_due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute allowedRoles={['team_lead', 'manager', 'admin', 'finance']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <ReportsView />
      </div>
    </ProtectedRoute>
  );
}
