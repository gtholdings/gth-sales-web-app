'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useT } from '@/contexts/LanguageContext';
import { formatRs } from '@/lib/format';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  confirmed: 'bg-indigo-100 text-indigo-800 border border-indigo-300',
  in_progress: 'bg-amber-100 text-amber-800 border border-amber-300',
  closed: 'bg-green-100 text-green-800 border border-green-300',
  rejected: 'bg-red-100 text-red-800 border border-red-300',
};
const STATUS_ORDER = ['pending', 'confirmed', 'in_progress', 'closed', 'rejected'];
const SORT_FIELDS = ['date', 'customer', 'status', 'type', 'value', 'to_collect', 'collected', 'pending'];

const StatusBadge = ({ status }) => {
  const { t } = useT();
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {t('sale_status.' + status)}
    </span>
  );
};

const PaymentBadge = ({ type }) => {
  const { t } = useT();
  const styles = {
    full: 'bg-green-100 text-green-800 border border-green-300',
    installment: 'bg-blue-100 text-blue-800 border border-blue-300',
  };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${styles[type] || styles.installment}`}>
      {t('payment_type.' + type)}
    </span>
  );
};

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' });

const repName = (sale) => sale.rep_name || sale.rep?.full_name || 'N/A';
const eff = (s) => s.effective_status || s.status;

// Comparable value for a sale on the chosen sort field.
function sortVal(sale, field) {
  switch (field) {
    case 'customer': return (sale.customer_name || '').toLowerCase();
    case 'status': return STATUS_ORDER.indexOf(eff(sale));
    case 'type': return sale.payment_type || '';
    case 'value': return Number(sale.total_amount) || 0;
    case 'to_collect': return Number(sale.collectible_total ?? sale.total_amount) || 0;
    case 'collected': return Number(sale.collected_amount) || 0;
    case 'pending': return Number(sale.pending_amount) || 0;
    case 'date':
    default: return sale.created_at || '';
  }
}

const CTRL = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white';

export const SalesTable = ({ sales = [], userRole, loading = false }) => {
  const { t } = useT();
  const [searchTerm, setSearchTerm] = useState('');
  const [showControls, setShowControls] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const activeFilters = [statusFilter, typeFilter, dateFrom, dateTo].filter(Boolean).length;

  const visibleSales = useMemo(() => {
    let arr = sales;
    const term = searchTerm.trim().toLowerCase();
    if (term) arr = arr.filter((s) => s.customer_name.toLowerCase().includes(term) || s.nic_number.toLowerCase().includes(term));
    if (statusFilter) arr = arr.filter((s) => eff(s) === statusFilter);
    if (typeFilter) arr = arr.filter((s) => (s.payment_type || 'installment') === typeFilter);
    if (dateFrom) arr = arr.filter((s) => (s.created_at || '').slice(0, 10) >= dateFrom);
    if (dateTo) arr = arr.filter((s) => (s.created_at || '').slice(0, 10) <= dateTo);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      const va = sortVal(a, sortBy), vb = sortVal(b, sortBy);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [sales, searchTerm, statusFilter, typeFilter, dateFrom, dateTo, sortBy, sortDir]);

  const clearAll = () => { setSearchTerm(''); setStatusFilter(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); };

  // Reps can now finalize (install) their own pending sale; field officers are read-only.
  const canActOnPending = ['rep', 'supervisor', 'manager', 'admin'].includes(userRole);
  const showRep = userRole !== 'rep';

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-gray-500 text-lg">{t('sales.none')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Search + filters/sort toolbar */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t('sales.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            className={`shrink-0 px-3 py-2.5 rounded-lg border text-sm font-medium ${showControls || activeFilters ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700'}`}
          >
            {t('sales.filters_sort')}{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
        </div>

        {showControls && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('sales.col_status')}</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={CTRL}>
                <option value="">{t('sales.all')}</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{t('sale_status.' + s)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('sales.col_type')}</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={CTRL}>
                <option value="">{t('sales.all')}</option>
                <option value="installment">{t('payment_type.installment')}</option>
                <option value="full">{t('payment_type.full')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('sales.f_from')}</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={CTRL} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('sales.f_to')}</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={CTRL} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('sales.sort_by')}</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={CTRL}>
                {SORT_FIELDS.map((f) => <option key={f} value={f}>{t('sales.col_' + f)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('sales.order')}</label>
              <button type="button" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} className={`${CTRL} text-left`}>
                {sortDir === 'asc' ? `↑ ${t('sales.order_asc')}` : `↓ ${t('sales.order_desc')}`}
              </button>
            </div>
            {(activeFilters > 0 || searchTerm) && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-6">
                <button type="button" onClick={clearAll} className="text-sm text-blue-600 hover:underline">{t('sales.clear_filters')}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {visibleSales.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500 text-lg mb-4">{t('sales.no_match')}</p>
          <button
            type="button"
            onClick={clearAll}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded-lg transition-colors"
          >
            {t('sales.clear_filters')}
          </button>
        </div>
      ) : (
        <>
          {/* ---- Desktop / tablet: table ---- */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('sales.col_date')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('sales.col_customer')}</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">{t('sales.col_type')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('sales.col_value')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('sales.col_to_collect')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('sales.col_collected')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{t('sales.col_pending')}</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">{t('sales.col_status')}</th>
                  {showRep && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">{t('sales.col_rep')}</th>
                  )}
                  {canActOnPending && (
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">{t('common.actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{fmtDate(sale.created_at)}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/sales/${sale.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                        {sale.customer_name}
                      </Link>
                      <div className="text-gray-400 font-mono text-xs">{sale.nic_number}</div>
                    </td>
                    <td className="px-4 py-3 text-center"><PaymentBadge type={sale.payment_type} /></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatRs(sale.total_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatRs(sale.collectible_total ?? sale.total_amount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700 whitespace-nowrap">{formatRs(sale.collected_amount ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-medium text-amber-700 whitespace-nowrap">{formatRs(sale.pending_amount ?? 0)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={eff(sale)} /></td>
                    {showRep && <td className="px-4 py-3 text-gray-700 text-xs">{repName(sale)}</td>}
                    {canActOnPending && (
                      <td className="px-4 py-3 text-center">
                        {eff(sale) === 'pending' ? (
                          <Link
                            href={`/sales/${sale.id}`}
                            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                          >
                            {t('sales.review')}
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- Mobile: spaced card list (native-app feel) ---- */}
          <ul className="md:hidden bg-gray-50 p-3 space-y-3">
            {visibleSales.map((sale) => (
              <li key={sale.id}>
                <Link href={`/sales/${sale.id}`} className="block rounded-xl border border-gray-200 bg-white shadow-sm p-3.5 active:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{sale.customer_name}</p>
                      <p className="text-gray-400 font-mono text-xs">{sale.nic_number}</p>
                    </div>
                    <StatusBadge status={eff(sale)} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-gray-50 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">{t('sales.col_to_collect')}</div>
                      <div className="text-xs font-semibold text-gray-800 tabular-nums">{formatRs(sale.collectible_total ?? sale.total_amount)}</div>
                    </div>
                    <div className="rounded-md bg-green-50 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-green-500">{t('sales.col_collected')}</div>
                      <div className="text-xs font-semibold text-green-700 tabular-nums">{formatRs(sale.collected_amount ?? 0)}</div>
                    </div>
                    <div className="rounded-md bg-amber-50 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-amber-500">{t('sales.col_pending')}</div>
                      <div className="text-xs font-semibold text-amber-700 tabular-nums">{formatRs(sale.pending_amount ?? 0)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-2 min-w-0">
                      <PaymentBadge type={sale.payment_type} />
                      {showRep && <span className="truncate">{repName(sale)}</span>}
                    </span>
                    <span className="shrink-0">{fmtDate(sale.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* footer count */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            {t('sales.showing', { n: visibleSales.length, total: sales.length })}
          </div>
        </>
      )}
    </div>
  );
};
