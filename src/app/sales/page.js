'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SalesTable } from '@/components/SalesTable';
import { useAuth } from '@/contexts/AuthContext';

export default function SalesPage() {
  const { user, token } = useAuth();
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSales = async () => {
      if (!token) return;

      try {
        setIsLoading(true);
        setError('');

        const response = await fetch('/api/sales', {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setSales(data.sales || []);
        } else {
          setError('Failed to load sales data');
        }
      } catch (err) {
        console.error('Error fetching sales:', err);
        setError('An error occurred while loading sales');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSales();
  }, [token]);

  const handleApprove = (saleId) => {
    setSales((prev) =>
      prev.map((sale) => (sale.id === saleId ? { ...sale, status: 'approved' } : sale))
    );
  };

  const handleReject = (saleId) => {
    setSales((prev) =>
      prev.map((sale) => (sale.id === saleId ? { ...sale, status: 'rejected' } : sale))
    );
  };

  return (
    <ProtectedRoute allowedRoles={['any']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              {user?.role === 'rep' ? 'My Sales' : 'All Sales'}
            </h1>
            <p className="text-gray-600 mt-2">Dialog TV sales records</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <SalesTable
            sales={sales}
            userRole={user?.role}
            onApprove={handleApprove}
            onReject={handleReject}
            loading={isLoading}
          />
        </main>
      </div>
    </ProtectedRoute>
  );
}
