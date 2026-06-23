import { addMonths, format, parseISO, differenceInCalendarDays } from 'date-fns';

/**
 * Installment scheduling + status helpers.
 *
 * The "base" / down-payment is stored as the installment row with
 * installment_number = 0 and is_base = true. The N scheduled payments are
 * rows 1..N with monthly due dates.
 */

/**
 * Total amount repayable over the installments for a financed principal.
 * A FLAT interest of (interestPercent% × number_of_installments) is added to the
 * principal (the financed amount = Total Value − Down Payment):
 *   totalRepayable = principal × (1 + (interestPercent/100) × n)
 * e.g. principal 5000, 10%, n=2 → 5000×1.2 = 6000; n=3 → 5000×1.3 = 6500.
 * @param {number} principal - financed amount (total - down payment)
 * @param {number} n - number of installments
 * @param {number} interestPercent - interest rate as a percent (e.g. 10), from app_config
 * @returns {number} total repayable, rounded to 2 decimals
 */
export function totalRepayable(principal, n, interestPercent) {
  const rate = Number(interestPercent || 0) / 100;
  return Math.round(Number(principal) * (1 + rate * Number(n)) * 100) / 100;
}

/**
 * Split a total into N installment amounts. Each installment is the per-period
 * value rounded to the cent; the LAST installment absorbs the rounding remainder
 * so the sum is exact. (e.g. 6500 / 3 → 2166.67, 2166.67, 2166.66.)
 * @param {number} total - amount to split across the installments
 * @param {number} n - number of installments (>= 1)
 * @returns {number[]} array of N amounts, 2-decimal, summing exactly to `total`
 */
export function splitInstallmentAmounts(total, n) {
  const each = Math.round((Number(total) / n) * 100) / 100;
  const amounts = [];
  for (let i = 0; i < n - 1; i++) amounts.push(each);
  amounts.push(Math.round((Number(total) - each * (n - 1)) * 100) / 100);
  return amounts;
}

/**
 * Installment due dates derived from the DOWN-PAYMENT date (the anchor).
 * Installment k (1..N) is due k months after the down-payment date, same
 * day-of-month, clamped to the month's last day when that day doesn't exist
 * (date-fns addMonths: e.g. Jan 31 -> Feb 28; May 31 -> Jun 30). The down
 * payment itself is on `downPaymentDate` and is NOT included here.
 * @param {string|Date} downPaymentDate - 'YYYY-MM-DD' or Date
 * @param {number} n - number of installments
 * @returns {string[]} array of N 'YYYY-MM-DD' strings (k = 1..N)
 */
export function installmentDueDates(downPaymentDate, n) {
  const anchor = typeof downPaymentDate === 'string' ? parseISO(downPaymentDate) : downPaymentDate;
  const dates = [];
  for (let k = 1; k <= n; k++) {
    dates.push(format(addMonths(anchor, k), 'yyyy-MM-dd'));
  }
  return dates;
}

/**
 * Compute the status to DISPLAY for an installment, overlaying overdue/defaulted
 * from the due date so reads are always correct even if the cron hasn't run.
 * Terminal/in-review statuses (paid, awaiting_confirmation) are returned as-is.
 * @param {{status: string, due_date: string}} inst
 * @param {number} thresholdDays - days overdue before "defaulted"
 * @param {Date} today - Date representing "today" (caller computes in app tz)
 * @returns {'pending'|'awaiting_confirmation'|'paid'|'overdue'|'defaulted'}
 */
export function installmentDisplayStatus(inst, thresholdDays, today) {
  if (inst.status === 'paid' || inst.status === 'awaiting_confirmation') {
    return inst.status;
  }
  if (!inst.due_date) return 'pending';
  const due = parseISO(inst.due_date);
  const daysPast = differenceInCalendarDays(today, due);
  if (daysPast > thresholdDays) return 'defaulted';
  if (daysPast > 0) return 'overdue';
  return 'pending';
}
