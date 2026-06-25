'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { isValidLKMobile, PHONE_FORMAT_HINT } from '@/lib/phone';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, register } = useAuth();
  const { t } = useT();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [supervisors, setSupervisors] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    role: 'rep',
    supervisor_id: '',
    manager_id: '',
  });

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch supervisors when role is rep
  useEffect(() => {
    if (formData.role === 'rep') {
      const fetchSupervisors = async () => {
        try {
          setLoadingProfiles(true);
          const response = await fetch('/api/profiles/supervisors');
          if (response.ok) {
            const data = await response.json();
            setSupervisors(data.supervisors || []);
          }
        } catch (err) {
          console.error('Error fetching supervisors:', err);
        } finally {
          setLoadingProfiles(false);
        }
      };
      fetchSupervisors();
    }
  }, [formData.role]);

  // Fetch managers when role is supervisor
  useEffect(() => {
    if (formData.role === 'supervisor') {
      const fetchManagers = async () => {
        try {
          setLoadingProfiles(true);
          const response = await fetch('/api/profiles/managers');
          if (response.ok) {
            const data = await response.json();
            setManagers(data.managers || []);
          }
        } catch (err) {
          console.error('Error fetching managers:', err);
        } finally {
          setLoadingProfiles(false);
        }
      };
      fetchManagers();
    }
  }, [formData.role]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Validation
    if (!formData.full_name.trim()) {
      setError(t('register.err_full_name'));
      return;
    }

    if (!formData.phone.trim()) {
      setError(t('register.err_mobile_required'));
      return;
    }

    if (!isValidLKMobile(formData.phone)) {
      setError(t('register.err_mobile_format'));
      return;
    }

    if (!formData.password) {
      setError(t('register.err_password_required'));
      return;
    }

    if (formData.password.length < 6) {
      setError(t('register.err_password_len'));
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError(t('register.err_password_match'));
      return;
    }

    if (formData.role === 'rep' && !formData.supervisor_id) {
      setError(t('register.err_supervisor'));
      return;
    }

    if (formData.role === 'supervisor' && !formData.manager_id) {
      setError(t('register.err_manager'));
      return;
    }

    try {
      setIsLoading(true);

      const submitData = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
        role: formData.role,
      };

      if (formData.role === 'rep') {
        submitData.supervisor_id = formData.supervisor_id;
      }

      if (formData.role === 'supervisor') {
        submitData.manager_id = formData.manager_id;
      }

      const result = await register(submitData);
      if (result.success) {
        setSuccessMessage(t('register.success'));
        // Reset form
        setFormData({
          full_name: '',
          email: '',
          phone: '',
          password: '',
          confirm_password: '',
          role: 'rep',
          supervisor_id: '',
          manager_id: '',
        });
        // Redirect after 3 seconds
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Register error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Language Switcher */}
          <div className="flex justify-end mb-2">
            <LanguageSwitcher />
          </div>

          {/* Brand Section */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-blue-800 mb-2">GT Sales</h1>
            <p className="text-gray-600">{t('register.subtitle')}</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
              {successMessage}
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
                {t('register.full_name')} *
              </label>
              <input
                type="text"
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleInputChange}
                placeholder="John Doe"
                required
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Mobile Number — this is the login username */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                {t('register.mobile')} *
              </label>
              <input
                type="tel"
                inputMode="numeric"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="0771234567"
                maxLength={10}
                required
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">
                {t('register.mobile_hint')}
              </p>
            </div>

            {/* Email (optional — for communications only) */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                {t('register.email')} <span className="text-gray-400">{t('common.optional')}</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="you@example.com"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">{t('register.email_hint')}</p>
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                {t('register.role')} *
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                required
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="rep">{t('role.rep')}</option>
                <option value="supervisor">{t('role.supervisor')}</option>
                <option value="manager">{t('role.manager')}</option>
                <option value="credit_officer">{t('role.credit_officer')}</option>
                <option value="field_officer">{t('role.field_officer')}</option>
              </select>
            </div>

            {/* Supervisor Selection (for Reps) */}
            {formData.role === 'rep' && (
              <div>
                <label htmlFor="supervisor_id" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('register.reporting_supervisor')} *
                </label>
                <select
                  id="supervisor_id"
                  name="supervisor_id"
                  value={formData.supervisor_id}
                  onChange={handleInputChange}
                  required
                  disabled={isLoading || loadingProfiles}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('register.select_supervisor')}</option>
                  {supervisors.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Manager Selection (for Supervisors) */}
            {formData.role === 'supervisor' && (
              <div>
                <label htmlFor="manager_id" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('register.reporting_manager')} *
                </label>
                <select
                  id="manager_id"
                  name="manager_id"
                  value={formData.manager_id}
                  onChange={handleInputChange}
                  required
                  disabled={isLoading || loadingProfiles}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('register.select_manager')}</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                {t('register.password')} *
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-2">
                {t('register.confirm_password')} *
              </label>
              <input
                type="password"
                id="confirm_password"
                name="confirm_password"
                value={formData.confirm_password}
                onChange={handleInputChange}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || loadingProfiles}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg text-lg transition-colors flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('register.registering')}
                </>
              ) : (
                t('register.create')
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              {t('register.have_account')}{' '}
              <a href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
                {t('register.signin')}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
