'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isValidLKMobile, PHONE_FORMAT_HINT } from '@/lib/phone';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, register } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [teamLeads, setTeamLeads] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    role: 'rep',
    team_lead_id: '',
    manager_id: '',
  });

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch team leads when role is rep
  useEffect(() => {
    if (formData.role === 'rep') {
      const fetchTeamLeads = async () => {
        try {
          setLoadingProfiles(true);
          const response = await fetch('/api/profiles/team-leads');
          if (response.ok) {
            const data = await response.json();
            setTeamLeads(data.team_leads || []);
          }
        } catch (err) {
          console.error('Error fetching team leads:', err);
        } finally {
          setLoadingProfiles(false);
        }
      };
      fetchTeamLeads();
    }
  }, [formData.role]);

  // Fetch managers when role is team_lead
  useEffect(() => {
    if (formData.role === 'team_lead') {
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
      setError('Full name is required');
      return;
    }

    if (!formData.phone.trim()) {
      setError('Mobile number is required');
      return;
    }

    if (!isValidLKMobile(formData.phone)) {
      setError(PHONE_FORMAT_HINT);
      return;
    }

    if (!formData.password) {
      setError('Password is required');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    if (formData.role === 'rep' && !formData.team_lead_id) {
      setError('Team Lead is required for Sales Representatives');
      return;
    }

    if (formData.role === 'team_lead' && !formData.manager_id) {
      setError('Manager is required for Team Leads');
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
        submitData.team_lead_id = formData.team_lead_id;
      }

      if (formData.role === 'team_lead') {
        submitData.manager_id = formData.manager_id;
      }

      const result = await register(submitData);
      if (result.success) {
        setSuccessMessage(
          'Registration submitted successfully! Awaiting admin approval. You can now login once approved.'
        );
        // Reset form
        setFormData({
          full_name: '',
          email: '',
          phone: '',
          password: '',
          confirm_password: '',
          role: 'rep',
          team_lead_id: '',
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
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Brand Section */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-blue-800 mb-2">GTH Sales</h1>
            <p className="text-gray-600">Create New Account</p>
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
                Full Name *
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
                Mobile Number *
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
                You will log in with this number. {PHONE_FORMAT_HINT}
              </p>
            </div>

            {/* Email (optional — for communications only) */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-gray-400">(optional)</span>
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
              <p className="mt-1 text-sm text-gray-500">Used for notifications only, not for login.</p>
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                Role *
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
                <option value="rep">Sales Representative</option>
                <option value="team_lead">Team Lead</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance</option>
                <option value="support">Support</option>
              </select>
            </div>

            {/* Team Lead Selection (for Reps) */}
            {formData.role === 'rep' && (
              <div>
                <label htmlFor="team_lead_id" className="block text-sm font-medium text-gray-700 mb-2">
                  Reporting to Team Lead *
                </label>
                <select
                  id="team_lead_id"
                  name="team_lead_id"
                  value={formData.team_lead_id}
                  onChange={handleInputChange}
                  required
                  disabled={isLoading || loadingProfiles}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Select a Team Lead --</option>
                  {teamLeads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Manager Selection (for Team Leads) */}
            {formData.role === 'team_lead' && (
              <div>
                <label htmlFor="manager_id" className="block text-sm font-medium text-gray-700 mb-2">
                  Reporting to Manager *
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
                  <option value="">-- Select a Manager --</option>
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
                Password *
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
                Confirm Password *
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
                  Registering...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <a href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
                Sign in here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
