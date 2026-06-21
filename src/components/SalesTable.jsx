'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const StatusBadge = ({ status }) => {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    approved: 'bg-green-100 text-green-800 border border-green-300',
    rejected: 'bg-red-100 text-red-800 border border-red-300',
    completed: 'bg-blue-100 text-blue-800 border border-blue-300',
  };

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const PaymentBadge = ({ type }) => {
  const styles = {
    full: 'bg-green-100 text-green-800 border border-green-300',
    installment: 'bg-blue-100 text-blue-800 border border-blue-300',
  };

  const label = type === 'full' ? 'Full Payment' : 'Installment';

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${styles[type]}`}>
      {label}
    </span>
  );
};

export const SalesTable = ({ sales = [], userRole, onApprove, onReject, loading = false }) => {
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  const filteredSales = useMemo(() => {
    if (!searchTerm.trim()) return sales;

    const term = searchTerm.toLowerCase();
    return sales.filter((sale) =>
      sale.customer_name.toLowerCase().includes(term) ||
      sale.nic_number.toLowerCase().includes(term)
    );
  }, [sales, searchTerm]);

  const handleApprove = async (saleId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [saleId]: true }));

      const response = await fetch(`/api/sales/${saleId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'approve' }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve sale');
      }

      if (onApprove) {
        onApprove(saleId);
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert('Failed to approve sale. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [saleId]: false }));
    }
  };

  const handleReject = async (saleId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [saleId]: true }));

      const response = await fetch(`/api/sales/${saleId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reject' }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject sale');
      }

      if (onReject) {
        onReject(saleId);
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('Failed to reject sale. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [saleId]: false }));
    }
  };

  const canApproveReject = ['team_lead', 'manager', 'admin'].includes(userRole);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (filteredSales.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-gray-500 text-lg">
          {searchTerm ? 'No sales found matching your search.' : 'No sales records found.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search by customer name or NIC..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Table - Responsive with horizontal scroll on mobile */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Customer</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">NIC</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Phone</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Type</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
              {!['rep'].includes(userRole) && (
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Rep</th>
              )}
              {canApproveReject && (
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((sale) => {
              const saleDate = new Date(sale.created_at).toLocaleDateString('en-LK', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              const amount = new Intl.NumberFormat('en-LK', {
                style: 'currency',
                currency: 'LKR',
              }).format(sale.total_amount);

              return (
                <tr key={sale.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">{saleDate}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{sale.customer_name}</td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs">{sale.nic_number}</td>
                  <td className="px-4 py-3 text-gray-700">{sale.personal_phone}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{amount}</td>
                  <td className="px-4 py-3 text-center">
                    <PaymentBadge type={sale.payment_type} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={sale.status} />
                  </td>
                  {!['rep'].includes(userRole) && (
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {sale.rep_name || 'N/A'}
                    </td>
                  )}
                  {canApproveReject && sale.status === 'pending' && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleApprove(sale.id)}
                          disabled={actionLoading[sale.id]}
                          className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                        >
                          {actionLoading[sale.id] ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(sale.id)}
                          disabled={actionLoading[sale.id]}
                          className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                        >
                          {actionLoading[sale.id] ? 'Processing...' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  )}
                  {canApproveReject && sale.status !== 'pending' && (
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      —
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table footer - results count */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
        Showing {filteredSales.length} of {sales.length} sales
      </div>
    </div>
  );
};
