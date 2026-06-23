'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

// Minimal inline icons (stroke-based, inherit currentColor).
const Icon = ({ d }) => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);
const ICONS = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  sales: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  new: 'M12 4v16m8-8H4',
  reports: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  admin: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
};

// Primary tabs per role (kept to <=5 for a native bottom bar).
function tabsFor(role, t) {
  const T = {
    dashboard: { key: 'dashboard', href: '/dashboard', label: t('nav.dashboard'), icon: 'dashboard' },
    sales: { key: 'sales', href: '/sales', label: t('nav.sales'), icon: 'sales' },
    newSale: { key: 'new', href: '/sales/new', label: t('nav.new_sale'), icon: 'new' },
    reports: { key: 'reports', href: '/reports', label: t('nav.reports'), icon: 'reports' },
    admin: { key: 'admin', href: '/admin', label: t('nav.admin'), icon: 'admin' },
  };
  switch (role) {
    case 'rep':
    case 'supervisor':
    case 'manager':
      return [T.dashboard, T.sales, T.newSale, T.reports];
    case 'admin':
      return [T.dashboard, T.sales, T.reports, T.admin];
    case 'credit_officer':
      return [T.dashboard, T.sales, T.reports];
    case 'field_officer':
    default:
      return [T.dashboard, T.sales];
  }
}

export const BottomNav = () => {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useT();

  if (!user) return null;

  const tabs = tabsFor(user.role, t);
  const isActive = (href) => (href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(href + '/'));

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-1px_8px_rgba(0,0,0,0.06)] pb-safe">
      <ul className="flex">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  active ? 'text-blue-700' : 'text-gray-500 active:text-blue-700'
                }`}
              >
                <Icon d={ICONS[tab.icon]} />
                <span className="leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
