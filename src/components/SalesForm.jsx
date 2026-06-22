'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { splitInstallmentAmounts, monthlyDueDates } from '@/lib/installments';

// Sri Lankan NIC validation: 9 digits + V/X (old) or 12 digits (new)
const validateNIC = (nic) => /^\d{9}[VXvx]$/.test(nic) || /^\d{12}$/.test(nic);

const lkr = (n) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(Number(n || 0));
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const EMPTY = {
  customer_name: '',
  nic_number: '',
  permanent_address: '',
  personal_phone: '',
  office_phone: '',
  total_amount: '',
  down_payment: '',
  num_installments: '',
  first_due_date: '',
  notes: '',
};

export const SalesForm = ({ onSuccess, onClose }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState(EMPTY);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  // ── Derived payment figures (auto-calculated) ─────────────────
  const total = parseFloat(formData.total_amount) || 0;
  const down = parseFloat(formData.down_payment) || 0;
  const loan = Math.max(Math.round((total - down) * 100) / 100, 0);
  const n = parseInt(formData.num_installments, 10) || 0;
  const amounts = loan > 0 && n > 0 ? splitInstallmentAmounts(loan, n) : [];
  const monthly = amounts.length ? amounts[0] : 0;
  const dueDates = formData.first_due_date && n > 0 ? monthlyDueDates(formData.first_due_date, n) : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.customer_name.trim()) return setError('Customer name is required');
    if (!formData.nic_number.trim()) return setError('NIC number is required');
    if (!validateNIC(formData.nic_number.trim()))
      return setError('Invalid NIC format. Use 9 digits + V/X (old) or 12 digits (new).');
    if (!formData.permanent_address.trim()) return setError('Permanent address is required');
    if (!formData.personal_phone.trim()) return setError('Personal phone is required');

    if (total <= 0) return setError('Total value must be greater than 0');
    if (down < 0) return setError('Down payment cannot be negative');
    if (down >= total) return setError('Down payment must be less than the total value (a loan is required)');
    if (n < 1) return setError('Number of installments must be at least 1');
    if (!formData.first_due_date) return setError('First installment date is required');

    try {
      setLoading(true);
      const submitData = {
        customer_name: formData.customer_name.trim(),
        nic_number: formData.nic_number.trim().toUpperCase(),
        permanent_address: formData.permanent_address.trim(),
        personal_phone: formData.personal_phone.trim(),
        office_phone: formData.office_phone.trim() || null,
        payment_type: 'installment',
        total_amount: total,
        base_amount: down, // down payment (collected later by a supervisor)
        num_installments: n,
        first_due_date: formData.first_due_date,
        notes: formData.notes.trim() || null,
      };

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(submitData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create sale');
      }
      const result = await response.json();
      setSuccessMessage(`Sale recorded! It now awaits a supervisor to collect the down payment. (ID: ${result.id})`);
      setFormData(EMPTY);
      if (onSuccess) setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      console.error('Form submission error:', err);
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg';
  const readonlyCls =
    'w-full px-4 py-3 border border-gray-200 bg-gray-50 rounded-lg text-lg font-semibold text-gray-900';

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">New Sale — Dialog TV</h2>
      <p className="text-sm text-gray-500 mb-6">
        You record the sale and the proposed payment plan. A team lead or manager collects the
        down payment and signs the agreement later — that is when the installment schedule is created.
      </p>

      {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">{successMessage}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Customer section ─────────────────────────────── */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">Customer Details</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
              <input type="text" id="customer_name" name="customer_name" value={formData.customer_name}
                onChange={handleInputChange} placeholder="Full name" disabled={loading} className={inputCls} />
            </div>
            <div>
              <label htmlFor="nic_number" className="block text-sm font-medium text-gray-700 mb-1">NIC Number *</label>
              <input type="text" id="nic_number" name="nic_number" value={formData.nic_number}
                onChange={handleInputChange} placeholder="123456789V or 200012345678" disabled={loading}
                className={`${inputCls} uppercase`} />
            </div>
            <div>
              <label htmlFor="permanent_address" className="block text-sm font-medium text-gray-700 mb-1">Permanent Address *</label>
              <input type="text" id="permanent_address" name="permanent_address" value={formData.permanent_address}
                onChange={handleInputChange} placeholder="Full address" disabled={loading} className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="personal_phone" className="block text-sm font-medium text-gray-700 mb-1">Personal Phone *</label>
                <input type="tel" id="personal_phone" name="personal_phone" value={formData.personal_phone}
                  onChange={handleInputChange} placeholder="Mobile number" disabled={loading} className={inputCls} />
              </div>
              <div>
                <label htmlFor="office_phone" className="block text-sm font-medium text-gray-700 mb-1">Office Phone</label>
                <input type="tel" id="office_phone" name="office_phone" value={formData.office_phone}
                  onChange={handleInputChange} placeholder="Optional" disabled={loading} className={inputCls} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Payment section ──────────────────────────────── */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">Payment Plan</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="total_amount" className="block text-sm font-medium text-gray-700 mb-1">Total Value (LKR) *</label>
                <input type="number" id="total_amount" name="total_amount" value={formData.total_amount}
                  onChange={handleInputChange} placeholder="0.00" step="0.01" min="0" disabled={loading} className={inputCls} />
              </div>
              <div>
                <label htmlFor="down_payment" className="block text-sm font-medium text-gray-700 mb-1">Down Payment (LKR) *</label>
                <input type="number" id="down_payment" name="down_payment" value={formData.down_payment}
                  onChange={handleInputChange} placeholder="0.00" step="0.01" min="0" disabled={loading} className={inputCls} />
              </div>
            </div>

            {/* Loan Amount — auto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Amount (LKR)</label>
              <div className={readonlyCls}>{lkr(loan)}</div>
              <p className="mt-1 text-xs text-gray-500">Auto: Total Value − Down Payment</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="num_installments" className="block text-sm font-medium text-gray-700 mb-1">No. of Installments *</label>
                <input type="number" id="num_installments" name="num_installments" value={formData.num_installments}
                  onChange={handleInputChange} placeholder="e.g. 3" step="1" min="1" disabled={loading} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Installment (LKR)</label>
                <div className={readonlyCls}>{monthly ? lkr(monthly) : '—'}</div>
                <p className="mt-1 text-xs text-gray-500">Auto: Loan ÷ No. of Installments</p>
              </div>
            </div>

            {/* First installment date — editable; rest auto */}
            <div>
              <label htmlFor="first_due_date" className="block text-sm font-medium text-gray-700 mb-1">First Installment Date *</label>
              <input type="date" id="first_due_date" name="first_due_date" value={formData.first_due_date}
                onChange={handleInputChange} disabled={loading} className={inputCls} />
              <p className="mt-1 text-xs text-gray-500">
                Agree this date with the customer. The remaining installments fall on the same day each month.
              </p>
            </div>

            {/* Installment schedule preview — auto */}
            {dueDates.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Installment Payment Dates</div>
                <table className="w-full text-sm">
                  <tbody>
                    {dueDates.map((d, i) => (
                      <tr key={d} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-700">Installment {i + 1}</td>
                        <td className="px-4 py-2 text-gray-900">{fmtDate(d)}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{lkr(amounts[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea id="notes" name="notes" value={formData.notes} onChange={handleInputChange}
                rows="2" placeholder="Optional" disabled={loading} className={inputCls} />
            </div>
          </div>
        </section>

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg text-lg transition-colors flex items-center justify-center">
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : 'Submit Sale'}
        </button>

        {onClose && (
          <button type="button" onClick={onClose} disabled={loading}
            className="w-full bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg text-lg transition-colors">
            Cancel
          </button>
        )}
      </form>
    </div>
  );
};
