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

export const SalesTable = ({ sales = [], userRole, loading = false }) => {
  const { t } = useT();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSales = useMemo(() => {
    if (!searchTerm.trim()) return sales;
    const term = searchTerm.toLowerCase();
    return sales.filter((sale) =>
      sale.customer_name.toLowerCase().includes(term) ||
      sale.nic_number.toLowerCase().includes(term)
    );
  }, [sales, searchTerm]);

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

  const eff = (s) => s.effective_status || s.status;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <input
          type="text"
          placeholder={t('sales.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {filteredSales.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500 text-lg mb-4">{t('sales.no_match')}</p>
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded-lg transition-colors"
          >
            {t('sales.clear_search')}
          </button>
        </div>
      ) : (
        <>
          {/* ---- Desktop / tablet: table (horizontal scroll if needed) ---- */}
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
                {filteredSales.map((sale) => (
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

          {/* ---- Mobile: card list (native-app feel) ---- */}
          <ul className="md:hidden divide-y divide-gray-100">
            {filteredSales.map((sale) => (
              <li key={sale.id}>
                <Link href={`/sales/${sale.id}`} className="block px-4 py-3 active:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{sale.customer_name}</p>
                      <p className="text-gray-400 font-mono text-xs">{sale.nic_number}</p>
                    </div>
                    <StatusBadge status={eff(sale)} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-gray-50 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">{t('sales.col_to_collect')}</div>
                      <div className="text-xs font-semibold text-gray-800">{formatRs(sale.collectible_total ?? sale.total_amount)}</div>
                    </div>
                    <div className="rounded-md bg-green-50 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-green-500">{t('sales.col_collected')}</div>
                      <div className="text-xs font-semibold text-green-700">{formatRs(sale.collected_amount ?? 0)}</div>
                    </div>
                    <div className="rounded-md bg-amber-50 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-amber-500">{t('sales.col_pending')}</div>
                      <div className="text-xs font-semibold text-amber-700">{formatRs(sale.pending_amount ?? 0)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-2">
                      <PaymentBadge type={sale.payment_type} />
                      {showRep && <span className="truncate">{repName(sale)}</span>}
                    </span>
                    <span>{fmtDate(sale.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* footer count */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            {t('sales.showing', { n: filteredSales.length, total: sales.length })}
          </div>
        </>
      )}
    </div>
  );
};
