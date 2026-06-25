'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useT();

  if (!user) return null;

  // Define nav items based on user role
  const getNavItems = () => {
    const items = [
      { label: t('nav.dashboard'), href: '/dashboard' },
      { label: t('nav.sales'), href: '/sales' },
    ];

    if (['rep', 'supervisor', 'manager'].includes(user.role)) {
      items.push({ label: t('nav.new_sale'), href: '/sales/new' });
    }

    // Reps see their own performance; everyone above can drill down. Field
    // officers are read-only on sales and have no reporting view.
    if (['rep', 'supervisor', 'manager', 'admin', 'credit_officer'].includes(user.role)) {
      items.push({ label: t('nav.reports'), href: '/reports' });
    }

    if (user.role === 'admin') {
      items.push({ label: t('nav.admin'), href: '/admin' });
      items.push({ label: t('nav.settings'), href: '/admin/settings' });
    }

    return items;
  };

  const navItems = getNavItems();

  const isActive = (href) => pathname === href;

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
  };

  return (
    <nav className="bg-blue-800 text-white shadow-lg sticky top-0 z-40 pt-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex-shrink-0 font-bold text-xl">
            GT Sales
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-900 text-white'
                    : 'text-blue-100 hover:bg-blue-700'
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Right side - User info and logout */}
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2">
              <div className="text-sm">
                <div className="font-medium">{user.full_name}</div>
                <div className="text-blue-200 text-xs">
                  <span className="inline-block bg-blue-700 px-2 py-1 rounded">
                    {t('role.' + user.role)}
                  </span>
                </div>
              </div>
            </div>

            <LanguageSwitcher className="hidden md:inline-block" />

            <button
              onClick={handleLogout}
              className="hidden md:inline-block bg-red-600 hover:bg-red-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {t('nav.logout')}
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-md hover:bg-blue-700 focus:outline-none"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-blue-700">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {/* Mobile user info */}
            <div className="px-3 py-2 border-b border-blue-600 mb-2">
              <div className="font-medium">{user.full_name}</div>
              <div className="text-blue-200 text-xs mt-1">
                <span className="inline-block bg-blue-800 px-2 py-1 rounded">
                  {t('role.' + user.role)}
                </span>
              </div>
            </div>

            {/* Mobile nav items */}
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-900 text-white'
                    : 'text-blue-100 hover:bg-blue-600'
                }`}
              >
                {item.label}
              </a>
            ))}

            {/* Mobile language switcher */}
            <div className="px-3 py-2">
              <LanguageSwitcher />
            </div>

            {/* Mobile logout button */}
            <button
              onClick={handleLogout}
              className="w-full text-left block px-3 py-2 rounded-md text-base font-medium bg-red-600 hover:bg-red-700 text-white transition-colors mt-4"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
