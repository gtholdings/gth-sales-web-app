'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;

  // Define nav items based on user role
  const getNavItems = () => {
    const items = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Sales', href: '/sales' },
    ];

    if (user.role === 'rep') {
      items.push({ label: 'New Sale', href: '/sales/new' });
    }

    if (['team_lead', 'manager', 'admin', 'finance'].includes(user.role)) {
      items.push({ label: 'Reports', href: '/reports' });
    }

    if (user.role === 'admin') {
      items.push({ label: 'Admin', href: '/admin' });
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
    <nav className="bg-blue-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex-shrink-0 font-bold text-xl">
            GTH Sales
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
                    {user.role.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="hidden md:inline-block bg-red-600 hover:bg-red-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Logout
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
                  {user.role.replace('_', ' ').toUpperCase()}
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

            {/* Mobile logout button */}
            <button
              onClick={handleLogout}
              className="w-full text-left block px-3 py-2 rounded-md text-base font-medium bg-red-600 hover:bg-red-700 text-white transition-colors mt-4"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
