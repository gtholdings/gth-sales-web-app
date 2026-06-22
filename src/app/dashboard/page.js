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

        // Fetch stats for manager/admin/finance roles
        if (['manager', 'admin', 'finance'].includes(user?.role)) {
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

  const handleApprove = (saleId) => {
    setSales((prevSales) =>
      prevSales.map((sale) =>
        sale.id === saleId ? { ...sale, status: 'approved' } : sale
      )
    );
  };

  const handleReject = (saleId) => {
    setSales((prevSales) =>
      prevSales.map((sale) =>
        sale.id === saleId ? { ...sale, status: 'rejected' } : sale
      )
    );
  };

  // Simple stats for rep/supervisor (without fetching reports)
  const getSimpleStats = () => {
    const totalSales = sales.length;
    const pendingSales = sales.filter((s) => s.status === 'pending').length;
    const approvedSales = sales.filter((s) => s.status === 'approved').length;
    const totalRevenue = sales.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);

    return {
      total_sales: totalSales,
      total_revenue: totalRevenue,
      by_status: {
        pending: pendingSales,
        approved: approvedSales,
        completed: 0,
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
              onApprove={handleApprove}
              onReject={handleReject}
              loading={isLoading}
            />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
