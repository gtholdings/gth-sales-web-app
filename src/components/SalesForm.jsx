'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Sri Lankan NIC validation
const validateNIC = (nic) => {
  // Format: 9 digits + V/X or 12 digits
  const oldFormat = /^\d{9}[VXvx]$/;
  const newFormat = /^\d{12}$/;
  return oldFormat.test(nic) || newFormat.test(nic);
};

export const SalesForm = ({ onSuccess, onClose }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [paymentType, setPaymentType] = useState('full');

  const [formData, setFormData] = useState({
    customer_name: '',
    nic_number: '',
    permanent_address: '',
    personal_phone: '',
    office_phone: '',
    payment_type: 'full',
    total_amount: '',
    num_installments: '1',
    notes: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (name === 'payment_type') {
      setPaymentType(value);
    }
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Validation
    if (!formData.customer_name.trim()) {
      setError('Customer name is required');
      return;
    }

    if (!formData.nic_number.trim()) {
      setError('NIC number is required');
      return;
    }

    if (!validateNIC(formData.nic_number.trim())) {
      setError(
        'Invalid NIC format. Use 9 digits + V/X (old format) or 12 digits (new format)'
      );
      return;
    }

    if (!formData.permanent_address.trim()) {
      setError('Permanent address is required');
      return;
    }

    if (!formData.personal_phone.trim()) {
      setError('Personal phone is required');
      return;
    }

    if (!formData.total_amount || parseFloat(formData.total_amount) <= 0) {
      setError('Total amount must be greater than 0');
      return;
    }

    if (formData.payment_type === 'installment') {
      const numInstallments = parseInt(formData.num_installments);
      if (!numInstallments || numInstallments < 1 || numInstallments > 3) {
        setError('Number of installments must be between 1 and 3');
        return;
      }
    }

    try {
      setLoading(true);

      const submitData = {
        customer_name: formData.customer_name.trim(),
        nic_number: formData.nic_number.trim().toUpperCase(),
        permanent_address: formData.permanent_address.trim(),
        personal_phone: formData.personal_phone.trim(),
        office_phone: formData.office_phone.trim() || null,
        payment_type: formData.payment_type,
        total_amount: parseFloat(formData.total_amount),
        num_installments:
          formData.payment_type === 'installment'
            ? parseInt(formData.num_installments)
            : 1,
        notes: formData.notes.trim() || null,
      };

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create sale');
      }

      const result = await response.json();
      setSuccessMessage(`Sale created successfully! Sale ID: ${result.id}`);

      // Reset form
      setFormData({
        customer_name: '',
        nic_number: '',
        permanent_address: '',
        personal_phone: '',
        office_phone: '',
        payment_type: 'full',
        total_amount: '',
        num_installments: '1',
        notes: '',
      });
      setPaymentType('full');

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (error) {
      console.error('Form submission error:', error);
      setError(error.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">New Sale - Dialog TV</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer Name */}
        <div>
          <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700 mb-1">
            Customer Name *
          </label>
          <input
            type="text"
            id="customer_name"
            name="customer_name"
            value={formData.customer_name}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            placeholder="Full name"
            disabled={loading}
          />
        </div>

        {/* NIC Number */}
        <div>
          <label htmlFor="nic_number" className="block text-sm font-medium text-gray-700 mb-1">
            NIC Number *
          </label>
          <input
            type="text"
            id="nic_number"
            name="nic_number"
            value={formData.nic_number}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg uppercase"
            placeholder="e.g., 123456789V or 123456789012345"
            disabled={loading}
          />
        </div>

        {/* Permanent Address */}
        <div>
          <label htmlFor="permanent_address" className="block text-sm font-medium text-gray-700 mb-1">
            Permanent Address *
          </label>
          <input
            type="text"
            id="permanent_address"
            name="permanent_address"
            value={formData.permanent_address}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            placeholder="Full address"
            disabled={loading}
          />
        </div>

        {/* Personal Phone */}
        <div>
          <label htmlFor="personal_phone" className="block text-sm font-medium text-gray-700 mb-1">
            Personal Phone *
          </label>
          <input
            type="tel"
            id="personal_phone"
            name="personal_phone"
            value={formData.personal_phone}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            placeholder="Mobile number"
            disabled={loading}
          />
        </div>

        {/* Office Phone */}
        <div>
          <label htmlFor="office_phone" className="block text-sm font-medium text-gray-700 mb-1">
            Office Phone (Optional)
          </label>
          <input
            type="tel"
            id="office_phone"
            name="office_phone"
            value={formData.office_phone}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            placeholder="Office number"
            disabled={loading}
          />
        </div>

        {/* Total Amount */}
        <div>
          <label htmlFor="total_amount" className="block text-sm font-medium text-gray-700 mb-1">
            Total Amount (LKR) *
          </label>
          <input
            type="number"
            id="total_amount"
            name="total_amount"
            value={formData.total_amount}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            placeholder="0.00"
            step="0.01"
            min="0"
            disabled={loading}
          />
        </div>

        {/* Payment Type */}
        <div>
          <label htmlFor="payment_type" className="block text-sm font-medium text-gray-700 mb-1">
            Payment Type *
          </label>
          <select
            id="payment_type"
            name="payment_type"
            value={formData.payment_type}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            disabled={loading}
          >
            <option value="full">Full Payment</option>
            <option value="installment">Installment</option>
          </select>
        </div>

        {/* Number of Installments (shown only for installment) */}
        {formData.payment_type === 'installment' && (
          <div>
            <label htmlFor="num_installments" className="block text-sm font-medium text-gray-700 mb-1">
              Number of Installments *
            </label>
            <select
              id="num_installments"
              name="num_installments"
              value={formData.num_installments}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              disabled={loading}
            >
              <option value="1">1 Installment</option>
              <option value="2">2 Installments</option>
              <option value="3">3 Installments</option>
            </select>
          </div>
        )}

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            rows="3"
            placeholder="Additional notes..."
            disabled={loading}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg text-lg transition-colors flex items-center justify-center"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            'Submit Sale'
          )}
        </button>

        {/* Close button if provided */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg text-lg transition-colors"
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  );
};
