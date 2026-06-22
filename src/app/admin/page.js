'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

// Roles the admin can assign. Reps report to a Supervisor; Supervisors report
// to a Manager; other roles have no supervisor in the hierarchy.
const ROLES = [
  { value: 'rep' },
  { value: 'supervisor' },
  { value: 'manager' },
  { value: 'admin' },
  { value: 'credit_officer' },
];

export default function AdminPage() {
  const { token } = useAuth();
  const { t } = useT();
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [managers, setManagers] = useState([]);
  // Per-pending-user edits the admin makes before approving: { [id]: { role, reports_to } }
  const [edits, setEdits] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  // Supervisor options depend on the (possibly edited) role:
  //   rep -> supervisors, supervisor -> managers, otherwise none.
  const supervisorOptionsFor = (role) => {
    if (role === 'rep') return { placeholder: t('admin.select_supervisor'), options: supervisors };
    if (role === 'supervisor') return { placeholder: t('admin.select_manager'), options: managers };
    return null;
  };

  // Update one field of a pending user's pending edit. Changing role clears the
  // chosen supervisor, since the valid options change.
  const setEdit = (userId, field, value) => {
    setEdits((prev) => {
      const next = { ...prev[userId], [field]: value };
      if (field === 'role') next.reports_to = '';
      return { ...prev, [userId]: next };
    });
  };

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

  // Load active supervisors + managers for the supervisor dropdowns.
  useEffect(() => {
    const fetchSupervisors = async () => {
      try {
        const [tlRes, mgrRes] = await Promise.all([
          fetch('/api/profiles/supervisors'),
          fetch('/api/profiles/managers'),
        ]);
        if (tlRes.ok) setSupervisors((await tlRes.json()).supervisors || []);
        if (mgrRes.ok) setManagers((await mgrRes.json()).managers || []);
      } catch (err) {
        console.error('Error fetching supervisors:', err);
      }
    };
    fetchSupervisors();
  }, []);

  // Seed the editable role/supervisor for any pending user we haven't touched yet.
  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const u of pendingUsers) {
        if (!next[u.id]) next[u.id] = { role: u.role, reports_to: u.reports_to || '' };
      }
      return next;
    });
  }, [pendingUsers]);

  const handleApproveUser = async (userId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [userId]: true }));

      // Apply the admin's edits (role + supervisor) alongside activation.
      const edit = edits[userId] || {};
      const role = edit.role;
      const needsSupervisor = role === 'rep' || role === 'supervisor';
      const reports_to = needsSupervisor ? edit.reports_to || null : null;

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'active', role, reports_to }),
      });

      if (response.ok) {
        // Remove from pending and reflect the new role/supervisor/status in All Users.
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
        setAllUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: 'active', role, reports_to } : u))
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
            <h1 className="text-3xl font-bold text-gray-900">{t('admin.title')}</h1>
            <p className="text-gray-600 mt-2">{t('admin.subtitle')}</p>
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
                {t('admin.tab_pending')} ({pendingUsers.length})
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'all'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('admin.tab_all')} ({allUsers.length})
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
                      <p className="text-gray-500 text-lg">{t('admin.no_pending')}</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-100 border-b border-gray-200">
                            <tr>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_name')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_email')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_phone')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_role')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_reports_to')}</th>
                              <th className="px-6 py-3 text-center font-semibold text-gray-700">{t('common.actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingUsers.map((user) => {
                              const edit = edits[user.id] || { role: user.role, reports_to: user.reports_to || '' };
                              const sup = supervisorOptionsFor(edit.role);
                              const busy = actionLoading[user.id];
                              return (
                              <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50 align-top">
                                <td className="px-6 py-4 font-medium text-gray-900">{user.full_name}</td>
                                <td className="px-6 py-4 text-gray-700">{user.email || '—'}</td>
                                <td className="px-6 py-4 text-gray-700">{user.phone}</td>
                                <td className="px-6 py-4 text-gray-700">
                                  <select
                                    value={edit.role}
                                    onChange={(e) => setEdit(user.id, 'role', e.target.value)}
                                    disabled={busy}
                                    className="w-full min-w-[10rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  >
                                    {ROLES.map((r) => (
                                      <option key={r.value} value={r.value}>{t('role.' + r.value)}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-6 py-4 text-gray-700">
                                  {sup ? (
                                    <select
                                      value={edit.reports_to || ''}
                                      onChange={(e) => setEdit(user.id, 'reports_to', e.target.value)}
                                      disabled={busy}
                                      className="w-full min-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                      <option value="">{sup.placeholder}</option>
                                      {sup.options.map((p) => (
                                        <option key={p.id} value={p.id}>{p.full_name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-gray-400 text-sm">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex gap-2 justify-center">
                                    <button
                                      onClick={() => handleApproveUser(user.id)}
                                      disabled={busy}
                                      className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                                    >
                                      {busy ? t('common.processing') : t('admin.approve')}
                                    </button>
                                    <button
                                      onClick={() => handleRejectUser(user.id)}
                                      disabled={busy}
                                      className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                                    >
                                      {busy ? t('common.processing') : t('admin.reject')}
                                    </button>
                                  </div>
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

              {/* All Users Tab */}
              {activeTab === 'all' && (
                <div>
                  {allUsers.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center">
                      <p className="text-gray-500 text-lg">{t('admin.no_users')}</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-100 border-b border-gray-200">
                            <tr>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_name')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_email')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_phone')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_role')}</th>
                              <th className="px-6 py-3 text-center font-semibold text-gray-700">{t('admin.col_status')}</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-700">{t('admin.col_reports_to')}</th>
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
                                      {t('role.' + user.role)}
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
