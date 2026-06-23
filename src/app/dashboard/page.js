'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SalesTable } from '@/components/SalesTable';
import { StatsCards } from '@/components/StatsCards';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

export default function DashboardPage() {
  const { user, token, loading } = useAuth();
  const { t } = useT();
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch sales data
  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      try {
        setIsLoading(true);
        setError('');

        // Fetch sales
        const salesResponse = await fetch('/api/sales', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (salesResponse.ok) {
          const salesData = await salesResponse.json();
          setSales(salesData.sales || []);
        } else {
          setError('Failed to load sales data');
        }

        // Everyone but the read-only Field Officer gets the rich stats
        // (incl. success rate) scoped to what they can see.
        if (user?.role !== 'field_officer') {
          const reportsResponse = await fetch('/api/sales/reports', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (reportsResponse.ok) {
            const reportsData = await reportsResponse.json();
            setStats(reportsData.stats || {});
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('An error occurred while loading data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [token, user?.role]);

  // Fallback stats computed from the sales list (used only for the Field
  // Officer, who has no reporting endpoint access).
  const getSimpleStats = () => {
    const eff = (s) => s.effective_status || s.status;
    const count = (st) => sales.filter((s) => eff(s) === st).length;
    const totalRevenue = sales.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
    const collectible = sales.reduce((sum, s) => sum + (parseFloat(s.collectible_total) || 0), 0);
    const won = count('confirmed') + count('in_progress') + count('closed');
    return {
      total_sales: sales.length,
      total_revenue: totalRevenue,
      total_collectible: Math.round(collectible * 100) / 100,
      success_rate: sales.length ? Math.round((won / sales.length) * 1000) / 10 : 0,
      won_sales: won,
      by_status: {
        pending: count('pending'),
        in_progress: count('in_progress'),
        closed: count('closed'),
      },
    };
  };

  const displayStats = Object.keys(stats).length > 0 ? stats : getSimpleStats();

  return (
    <ProtectedRoute allowedRoles={['any']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.title')}</h1>
            <p className="text-gray-600 mt-2">{t('dashboard.welcome', { name: user?.full_name })}</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Stats Cards */}
          {!isLoading && displayStats && (
            <div className="mb-8">
              <StatsCards stats={displayStats} />
            </div>
          )}

          {/* Recent Sales Section */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {user?.role === 'rep' ? t('dashboard.my_sales') : t('dashboard.all_sales')}
            </h2>
            <SalesTable
              sales={sales}
              userRole={user?.role}
              loading={isLoading}
            />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
