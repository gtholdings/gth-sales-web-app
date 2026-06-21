'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  // Fetch pending users
  useEffect(() => {
    const fetchPendingUsers = async () => {
      if (!token) return;

      try {
        const response = await fetch('/api/admin/users/pending', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPendingUsers(data.users || []);
        } else {
          setError('Failed to load pending users');
        }
      } catch (err) {
        console.error('Error fetching pending users:', err);
        setError('An error occurred while loading pending users');
      }
    };

    fetchPendingUsers();
  }, [token]);

  // Fetch all users
  useEffect(() => {
    const fetchAllUsers = async () => {
      if (!token) return;

      try {
        const response = await fetch('/api/admin/users', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAllUsers(data.users || []);
        } else {
          setError('Failed to load users');
        }
      } catch (err) {
        console.error('Error fetching users:', err);
        setError('An error occurred while loading users');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllUsers();
  }, [token]);

  const handleApproveUser = async (userId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [userId]: true }));

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'active' }),
      });

      if (response.ok) {
        // Remove from pending and add to all users
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
        setAllUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: 'active' } : u))
        );
      } else {
        setError('Failed to approve user');
      }
    } catch (err) {
      console.error('Error approving user:', err);
      setError('An error occurred while approving user');
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleRejectUser = async (userId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [userId]: true }));

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected' }),
      });

      if (response.ok) {
        // Remove from pending
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
        setAllUsers((prev) => prev.filter((u) => u.id !== userId));
      } else {
        setError('Failed to reject user');
      }
    } catch (err) {
      console.error('Error rejecting user:', err);
      setError('An error occurred while rejecting user');
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage users and system configuration</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('pending')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'pending'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Pending Approvals ({pendingUsers.length})
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'all'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                All Users ({allUsers.length})
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Pending Approvals Tab */}
              {activeTab === 'pending' && (
                <div>
                  {pendingUsers.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center">
                      <p className="text-gray-500 text-lg">No pending approvals</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-100 border-b border-gray-200">
                            <tr>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Name</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Email</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Phone</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Role</th>
                              <th className="px-6 py-3 text-center font-semibold text-gray-700">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingUsers.map((user) => (
                              <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{user.full_name}</td>
                                <td className="px-6 py-4 text-gray-700">{user.email}</td>
                                <td className="px-6 py-4 text-gray-700">{user.phone}</td>
                                <td className="px-6 py-4 text-gray-700">
                                  <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                                    {user.role.replace('_', ' ').toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex gap-2 justify-center">
                                    <button
                                      onClick={() => handleApproveUser(user.id)}
                                      disabled={actionLoading[user.id]}
                                      className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                                    >
                                      {actionLoading[user.id] ? 'Processing...' : 'Approve'}
                                    </button>
                                    <button
                                      onClick={() => handleRejectUser(user.id)}
                                      disabled={actionLoading[user.id]}
                                      className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                                    >
                                      {actionLoading[user.id] ? 'Processing...' : 'Reject'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All Users Tab */}
              {activeTab === 'all' && (
                <div>
                  {allUsers.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center">
                      <p className="text-gray-500 text-lg">No users found</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-100 border-b border-gray-200">
                            <tr>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Name</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Email</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Phone</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Role</th>
                              <th className="px-6 py-3 text-center font-semibold text-gray-700">Status</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">Reports To</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allUsers.map((user) => {
                              const statusColors = {
                                active: 'bg-green-100 text-green-800',
                                pending: 'bg-yellow-100 text-yellow-800',
                                rejected: 'bg-red-100 text-red-800',
                              };

                              return (
                                <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="px-6 py-4 font-medium text-gray-900">{user.full_name}</td>
                                  <td className="px-6 py-4 text-gray-700">{user.email}</td>
                                  <td className="px-6 py-4 text-gray-700">{user.phone}</td>
                                  <td className="px-6 py-4 text-gray-700">
                                    <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                                      {user.role.replace('_', ' ').toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColors[user.status] || statusColors.pending}`}>
                                      {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-gray-700 text-sm">
                                    {user.reports_to_name || 'N/A'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
