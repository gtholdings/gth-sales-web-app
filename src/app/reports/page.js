'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SalesTable } from '@/components/SalesTable';
import { StatsCards } from '@/components/StatsCards';
import { useAuth } from '@/contexts/AuthContext';

export default function ReportsPage() {
  const { user, token } = useAuth();
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      try {
        setIsLoading(true);
        setError('');

        // Fetch reports summary
        const reportsResponse = await fetch('/api/sales/reports', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (reportsResponse.ok) {
          const reportsData = await reportsResponse.json();
          setStats(reportsData.stats || {});
        } else {
          setError('Failed to load reports data');
        }

        // Fetch all sales data
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
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('An error occurred while loading data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [token]);

  return (
    <ProtectedRoute allowedRoles={['manager', 'admin', 'finance']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Sales Reports</h1>
            <p className="text-gray-600 mt-2">Overview of all sales activity and performance metrics</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Summary Stats */}
          {!isLoading && Object.keys(stats).length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Summary</h2>
              <StatsCards stats={stats} />
            </div>
          )}

          {/* Sales Data Table */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">All Sales</h2>
            <SalesTable
              sales={sales}
              userRole={user?.role}
              onApprove={() => {}}
              onReject={() => {}}
              loading={isLoading}
            />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
