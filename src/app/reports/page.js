'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { StatsCards } from '@/components/StatsCards';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { formatRs } from '@/lib/format';

const RANGES = [
  { value: 'MTD', label: 'reports.range_mtd' },
  { value: 'last_month', label: 'reports.range_last_month' },
  { value: 'last_90', label: 'reports.range_last_90' },
  { value: 'custom', label: 'reports.range_custom' },
];

// One label/value pair, used inside the mobile accordion (module scope so it
// isn't redefined each render).
function Metric({ label, value, className = 'text-gray-900' }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium tabular-nums ${className}`}>{value}</span>
    </div>
  );
}

const Chevron = ({ open }) => (
  <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

function ReportsView() {
  const { token, user } = useAuth();
  const { t } = useT();
  const isRep = user?.role === 'rep';
  const [filters, setFilters] = useState({ range: 'MTD', groupBy: 'month', from: '', to: '', scope: '' });
  const [report, setReport] = useState(null);
  const [stats, setStats] = useState(null);
  const [defaulters, setDefaulters] = useState(null);
  const [managers, setManagers] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openPeriod, setOpenPeriod] = useState(null); // mobile accordion

  // Load filter dropdown sources once (reps have no subordinates to filter by).
  useEffect(() => {
    if (isRep) return;
    (async () => {
      try {
        const auth = { headers: { Authorization: `Bearer ${token}` } };
        const [m, t, r] = await Promise.all([
          fetch('/api/profiles/managers', auth), fetch('/api/profiles/supervisors', auth), fetch('/api/profiles/reps', auth),
        ]);
        if (m.ok) setManagers((await m.json()).managers || []);
        if (t.ok) setSupervisors((await t.json()).supervisors || []);
        if (r.ok) setReps((await r.json()).reps || []);
      } catch { /* non-fatal */ }
    })();
  }, [isRep, token]);

  // Build the query string from filters. scope = "type:id".
  const queryString = useCallback(() => {
    const p = new URLSearchParams({ range: filters.range, groupBy: filters.groupBy });
    if (filters.range === 'custom' && filters.from && filters.to) { p.set('from', filters.from); p.set('to', filters.to); }
    if (filters.scope) {
      const [type, id] = filters.scope.split(':');
      const key = type === 'manager' ? 'managerId' : type === 'supervisor' ? 'supervisorId' : 'repId';
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
      const reqs = [fetch(`/api/sales/reports?${qs}`, { headers: { Authorization: `Bearer ${token}` } })];
      // Reps don't manage defaulters, so skip that fetch for them.
      if (!isRep) reqs.push(fetch(`/api/sales/reports/defaulters?${qs}`, { headers: { Authorization: `Bearer ${token}` } }));
      const [rep, def] = await Promise.all(reqs);
      if (rep.ok) { const j = await rep.json(); setReport(j.report); setStats(j.stats || null); } else setError('Failed to load report');
      if (def && def.ok) setDefaulters(await def.json());
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
        <h1 className="text-3xl font-bold text-gray-900">{t('reports.title')}</h1>
        <p className="text-gray-600 mt-2">{t('reports.subtitle')}</p>
      </div>

      {error && <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}

      {/* Headline metrics (incl. success rate) */}
      {stats && (
        <div className="mb-6">
          <StatsCards stats={stats} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('reports.range')}</label>
          <select value={filters.range} onChange={(e) => set('range', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg">
            {RANGES.map((r) => <option key={r.value} value={r.value}>{t(r.label)}</option>)}
          </select>
        </div>
        {filters.range === 'custom' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('reports.from')}</label>
              <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('reports.to')}</label>
              <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('reports.group_by')}</label>
          <select value={filters.groupBy} onChange={(e) => set('groupBy', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
            <option value="month">{t('reports.month')}</option>
            <option value="week">{t('reports.week')}</option>
          </select>
        </div>
        {!isRep && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('reports.filter_by')}</label>
          <select value={filters.scope} onChange={(e) => set('scope', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg min-w-[12rem]">
            <option value="">{t('reports.everyone')}</option>
            {managers.length > 0 && (
              <optgroup label={t('reports.managers')}>
                {managers.map((m) => <option key={m.id} value={`manager:${m.id}`}>{m.full_name}</option>)}
              </optgroup>
            )}
            {supervisors.length > 0 && (
              <optgroup label={t('reports.supervisors')}>
                {supervisors.map((t) => <option key={t.id} value={`supervisor:${t.id}`}>{t.full_name}</option>)}
              </optgroup>
            )}
            {reps.length > 0 && (
              <optgroup label={t('reports.reps')}>
                {reps.map((r) => <option key={r.id} value={`rep:${r.id}`}>{r.full_name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        )}
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button onClick={() => exportXlsx('summary')} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg">
            {t('reports.export_summary')}
          </button>
          {!isRep && (
            <button onClick={() => exportXlsx('defaulters')} className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white font-medium px-4 py-2 rounded-lg">
              {t('reports.export_defaulters')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
      ) : (
        <>
          {/* Period report */}
          <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
            <h2 className="text-lg font-bold text-gray-900 p-4 border-b border-gray-200">{t('reports.by_period')}</h2>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('reports.col_period')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_num_sales')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_confirmed')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_collectible')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_interest')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_cumulative')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_paid')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_awaiting')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_pending')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_defaulted')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.periods || []).length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-500">{t('reports.no_data')}</td></tr>
                  ) : report.periods.map((p) => (
                    <tr key={p.period} className="border-b border-gray-200">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.period}</td>
                      <td className="px-4 py-3 text-right">{p.num_sales}</td>
                      <td className="px-4 py-3 text-right">{formatRs(p.confirmed_sale_total)}</td>
                      <td className="px-4 py-3 text-right text-indigo-700">{formatRs(p.collectible_total)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatRs(p.interest_total)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatRs(p.cumulative_confirmed_total)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{formatRs(p.amount_paid)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{formatRs(p.amount_awaiting)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatRs(p.amount_pending)}</td>
                      <td className="px-4 py-3 text-right text-red-700">{formatRs(p.amount_defaulted)}</td>
                    </tr>
                  ))}
                  {report?.totals && report.periods.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-3">{t('reports.total')}</td>
                      <td className="px-4 py-3 text-right">{report.totals.num_sales}</td>
                      <td className="px-4 py-3 text-right">{formatRs(report.totals.confirmed_sale_total)}</td>
                      <td className="px-4 py-3 text-right text-indigo-700">{formatRs(report.totals.collectible_total)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatRs(report.totals.interest_total)}</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right text-green-700">{formatRs(report.totals.amount_paid)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{formatRs(report.totals.amount_awaiting)}</td>
                      <td className="px-4 py-3 text-right">{formatRs(report.totals.amount_pending)}</td>
                      <td className="px-4 py-3 text-right text-red-700">{formatRs(report.totals.amount_defaulted)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: tap a period to expand (no horizontal scroll) */}
            <div className="md:hidden divide-y divide-gray-100">
              {(report?.periods || []).length === 0 ? (
                <p className="px-4 py-6 text-center text-gray-500">{t('reports.no_data')}</p>
              ) : report.periods.map((p) => {
                const open = openPeriod === p.period;
                return (
                  <div key={p.period}>
                    <button type="button" onClick={() => setOpenPeriod(open ? null : p.period)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left active:bg-gray-50">
                      <div>
                        <div className="font-semibold text-gray-900">{p.period}</div>
                        <div className="text-xs text-gray-500">{p.num_sales} · {t('reports.col_num_sales')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-gray-400">{t('reports.col_collectible')}</div>
                          <div className="text-sm font-semibold text-indigo-700 tabular-nums">{formatRs(p.collectible_total)}</div>
                        </div>
                        <Chevron open={open} />
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 space-y-2 text-sm">
                        <Metric label={t('reports.col_confirmed')} value={formatRs(p.confirmed_sale_total)} />
                        <Metric label={t('reports.col_interest')} value={formatRs(p.interest_total)} />
                        <Metric label={t('reports.col_cumulative')} value={formatRs(p.cumulative_confirmed_total)} className="text-gray-600" />
                        <Metric label={t('reports.col_paid')} value={formatRs(p.amount_paid)} className="text-green-700" />
                        <Metric label={t('reports.col_awaiting')} value={formatRs(p.amount_awaiting)} className="text-amber-700" />
                        <Metric label={t('reports.col_pending')} value={formatRs(p.amount_pending)} />
                        <Metric label={t('reports.col_defaulted')} value={formatRs(p.amount_defaulted)} className="text-red-700" />
                      </div>
                    )}
                  </div>
                );
              })}
              {report?.totals && report.periods.length > 0 && (
                <div className="px-4 py-3 bg-gray-50">
                  <div className="font-semibold text-gray-900 mb-2">{t('reports.total')} · {report.totals.num_sales} {t('reports.col_num_sales')}</div>
                  <div className="space-y-2 text-sm">
                    <Metric label={t('reports.col_confirmed')} value={formatRs(report.totals.confirmed_sale_total)} />
                    <Metric label={t('reports.col_collectible')} value={formatRs(report.totals.collectible_total)} className="text-indigo-700" />
                    <Metric label={t('reports.col_interest')} value={formatRs(report.totals.interest_total)} />
                    <Metric label={t('reports.col_paid')} value={formatRs(report.totals.amount_paid)} className="text-green-700" />
                    <Metric label={t('reports.col_awaiting')} value={formatRs(report.totals.amount_awaiting)} className="text-amber-700" />
                    <Metric label={t('reports.col_pending')} value={formatRs(report.totals.amount_pending)} />
                    <Metric label={t('reports.col_defaulted')} value={formatRs(report.totals.amount_defaulted)} className="text-red-700" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Defaulters */}
          {!isRep && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="text-lg font-bold text-gray-900 p-4 border-b border-gray-200">
              {t('reports.defaulters')} {defaulters && <span className="text-sm font-normal text-gray-500">{t('reports.defaulters_total', { amount: formatRs(defaulters.total_defaulted_amount) })}</span>}
            </h2>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('reports.col_rep')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_defaulted_num')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('reports.col_defaulted_amount')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('reports.col_oldest_due')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(defaulters?.rows || []).length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">{t('reports.no_defaulters')}</td></tr>
                  ) : defaulters.rows.map((r) => (
                    <tr key={r.rep_id} className="border-b border-gray-200">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.rep_name}</td>
                      <td className="px-4 py-3 text-right">{r.defaulted_count}</td>
                      <td className="px-4 py-3 text-right text-red-700 font-semibold">{formatRs(r.defaulted_amount)}</td>
                      <td className="px-4 py-3 text-gray-700">{r.oldest_due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-gray-100">
              {(defaulters?.rows || []).length === 0 ? (
                <li className="px-4 py-6 text-center text-gray-500">{t('reports.no_defaulters')}</li>
              ) : defaulters.rows.map((r) => (
                <li key={r.rep_id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{r.rep_name}</div>
                    <div className="text-xs text-gray-500">{r.defaulted_count} {t('reports.col_defaulted_num')} · {r.oldest_due_date}</div>
                  </div>
                  <div className="text-right font-semibold text-red-700 tabular-nums shrink-0">{formatRs(r.defaulted_amount)}</div>
                </li>
              ))}
            </ul>
          </div>
          )}
        </>
      )}
    </main>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute allowedRoles={['rep', 'supervisor', 'manager', 'admin', 'credit_officer']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <ReportsView />
      </div>
    </ProtectedRoute>
  );
}
