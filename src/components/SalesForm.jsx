'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';
import { splitInstallmentAmounts, installmentDueDates } from '@/lib/installments';
import { formatRs } from '@/lib/format';

// Sri Lankan NIC: 9 digits + V/X (old) or 12 digits (new)
const validateNIC = (nic) => /^\d{9}[VXvx]$/.test(nic) || /^\d{12}$/.test(nic);
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
  down_payment_date: '',
  notes: '',
};

export const SalesForm = ({ onSuccess, onClose }) => {
  const { token } = useAuth();
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState(EMPTY);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  // ── Auto-calculated figures ──────────────────────────
  const total = parseFloat(formData.total_amount) || 0;
  const down = parseFloat(formData.down_payment) || 0;
  const loan = Math.max(Math.round((total - down) * 100) / 100, 0);
  const n = parseInt(formData.num_installments, 10) || 0;
  const amounts = loan > 0 && n > 0 ? splitInstallmentAmounts(loan, n) : [];
  const monthly = amounts.length ? amounts[0] : 0;
  const dueDates = formData.down_payment_date && n > 0 ? installmentDueDates(formData.down_payment_date, n) : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.customer_name.trim()) return setError(t('form.err_customer'));
    if (!formData.nic_number.trim()) return setError(t('form.err_nic'));
    if (!validateNIC(formData.nic_number.trim())) return setError(t('form.err_nic_format'));
    if (!formData.permanent_address.trim()) return setError(t('form.err_address'));
    if (!formData.personal_phone.trim()) return setError(t('form.err_phone'));
    if (total <= 0) return setError(t('form.err_total'));
    if (down < 0) return setError(t('form.err_down_neg'));
    if (down >= total) return setError(t('form.err_down_ge_total'));
    if (n < 1) return setError(t('form.err_installments'));
    if (!formData.down_payment_date) return setError(t('form.err_date'));

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
        base_amount: down,                          // proposed down payment
        num_installments: n,
        down_payment_date: formData.down_payment_date, // proposed; supervisor finalizes
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
      setSuccessMessage(t('form.success', { id: result.id }));
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
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('form.title')}</h2>
      <p className="text-sm text-gray-500 mb-6">{t('form.subtitle')}</p>

      {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">{successMessage}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Customer section */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">{t('form.customer_section')}</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700 mb-1">{t('form.customer_name')} *</label>
              <input type="text" id="customer_name" name="customer_name" value={formData.customer_name}
                onChange={handleInputChange} disabled={loading} className={inputCls} />
            </div>
            <div>
              <label htmlFor="nic_number" className="block text-sm font-medium text-gray-700 mb-1">{t('form.nic')} *</label>
              <input type="text" id="nic_number" name="nic_number" value={formData.nic_number}
                onChange={handleInputChange} placeholder="123456789V / 200012345678" disabled={loading} className={`${inputCls} uppercase`} />
            </div>
            <div>
              <label htmlFor="permanent_address" className="block text-sm font-medium text-gray-700 mb-1">{t('form.address')} *</label>
              <input type="text" id="permanent_address" name="permanent_address" value={formData.permanent_address}
                onChange={handleInputChange} disabled={loading} className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="personal_phone" className="block text-sm font-medium text-gray-700 mb-1">{t('form.personal_phone')} *</label>
                <input type="tel" id="personal_phone" name="personal_phone" value={formData.personal_phone}
                  onChange={handleInputChange} disabled={loading} className={inputCls} />
              </div>
              <div>
                <label htmlFor="office_phone" className="block text-sm font-medium text-gray-700 mb-1">{t('form.office_phone')}</label>
                <input type="tel" id="office_phone" name="office_phone" value={formData.office_phone}
                  onChange={handleInputChange} disabled={loading} className={inputCls} />
              </div>
            </div>
          </div>
        </section>

        {/* Payment section */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">{t('form.payment_section')}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="total_amount" className="block text-sm font-medium text-gray-700 mb-1">{t('form.total_value')} *</label>
                <input type="number" id="total_amount" name="total_amount" value={formData.total_amount}
                  onChange={handleInputChange} placeholder="0.00" step="0.01" min="0" disabled={loading} className={inputCls} />
              </div>
              <div>
                <label htmlFor="down_payment" className="block text-sm font-medium text-gray-700 mb-1">{t('form.down_payment')} *</label>
                <input type="number" id="down_payment" name="down_payment" value={formData.down_payment}
                  onChange={handleInputChange} placeholder="0.00" step="0.01" min="0" disabled={loading} className={inputCls} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.loan_amount')}</label>
              <div className={readonlyCls}>{formatRs(loan)}</div>
              <p className="mt-1 text-xs text-gray-500">{t('form.loan_hint')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="num_installments" className="block text-sm font-medium text-gray-700 mb-1">{t('form.num_installments')} *</label>
                <input type="number" id="num_installments" name="num_installments" value={formData.num_installments}
                  onChange={handleInputChange} placeholder="3" step="1" min="1" disabled={loading} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.monthly')}</label>
                <div className={readonlyCls}>{monthly ? formatRs(monthly) : '—'}</div>
                <p className="mt-1 text-xs text-gray-500">{t('form.monthly_hint')}</p>
              </div>
            </div>

            <div>
              <label htmlFor="down_payment_date" className="block text-sm font-medium text-gray-700 mb-1">{t('form.proposed_date')} *</label>
              <input type="date" id="down_payment_date" name="down_payment_date" value={formData.down_payment_date}
                onChange={handleInputChange} disabled={loading} className={inputCls} />
              <p className="mt-1 text-xs text-gray-500">{t('form.proposed_date_hint')}</p>
            </div>

            {/* Schedule preview */}
            {dueDates.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">{t('form.schedule_title')}</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-t border-gray-100 bg-blue-50/40">
                      <td className="px-4 py-2 text-gray-700">{t('form.down_payment_row')}</td>
                      <td className="px-4 py-2 text-gray-900">{fmtDate(formData.down_payment_date)}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">{formatRs(down)}</td>
                    </tr>
                    {dueDates.map((d, i) => (
                      <tr key={d + i} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-700">{t('form.installment_n', { n: i + 1 })}</td>
                        <td className="px-4 py-2 text-gray-900">{fmtDate(d)}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{formatRs(amounts[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes_optional')}</label>
              <textarea id="notes" name="notes" value={formData.notes} onChange={handleInputChange}
                rows="2" disabled={loading} className={inputCls} />
            </div>
          </div>
        </section>

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-lg text-lg transition-colors flex items-center justify-center">
          {loading ? t('common.saving') : t('common.submit')}
        </button>

        {onClose && (
          <button type="button" onClick={onClose} disabled={loading}
            className="w-full bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg text-lg transition-colors">
            {t('common.cancel')}
          </button>
        )}
      </form>
    </div>
  );
};
