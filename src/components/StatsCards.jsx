'use client';

import { formatRs } from '@/lib/format';
import { useT } from '@/contexts/LanguageContext';

const StatCard = ({ title, value, icon, color = 'blue', subtitle, wide = false }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  };

  const iconColorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
    indigo: 'bg-indigo-100 text-indigo-600',
  };

  // Icon sits on the title row; the value gets the FULL card width below it (and
  // money cards span the whole row on mobile) so large amounts are never clipped.
  return (
    <div className={`${colorClasses[color]} border rounded-lg p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-2">
        <p className="text-xs sm:text-sm font-medium text-gray-600">{title}</p>
        {icon && (
          <div className={`${iconColorClasses[color]} p-2 sm:p-2.5 rounded-lg shrink-0`}>
            {icon}
          </div>
        )}
      </div>
      <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 leading-tight break-words tabular-nums">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
};

// SVG Icons
const SalesIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const RevenueIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PendingIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CompletedIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const StatsCards = ({ stats = {} }) => {
  const { t } = useT();
  const {
    total_sales = 0,
    total_revenue = 0,
    total_collectible = 0,
    success_rate = 0,
    won_sales = 0,
    by_status = {},
  } = stats;

  const pending = by_status.pending || 0;
  const inProgress = by_status.in_progress || 0;
  const closed = by_status.closed || 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
      <StatCard title={t('stats.total_sales')} value={total_sales.toString()} icon={<SalesIcon />} color="blue" />
      <StatCard title={t('stats.success_rate')} value={`${success_rate}%`} icon={<CompletedIcon />} color="green"
        subtitle={t('stats.success_rate_hint', { won: won_sales, total: total_sales })} />
      <StatCard title={t('stats.total_revenue')} value={formatRs(total_revenue)} icon={<RevenueIcon />} color="purple" wide />
      <StatCard title={t('stats.total_collectible')} value={formatRs(total_collectible)} icon={<RevenueIcon />} color="indigo" wide />
      <StatCard title={t('stats.in_progress')} value={inProgress.toString()} icon={<PendingIcon />} color="yellow" />
      <StatCard title={t('stats.closed')} value={closed.toString()} icon={<CompletedIcon />} color="green" />
    </div>
  );
};
