import { addMonths, format, parseISO, differenceInCalendarDays } from 'date-fns';

/**
 * Installment scheduling + status helpers.
 *
 * The "base" / down-payment is stored as the installment row with
 * installment_number = 0 and is_base = true. The N scheduled payments are
 * rows 1..N with monthly due dates.
 */

/**
 * Split a remaining amount into N installment amounts using integer-cents math
 * so the sum is exact; the last installment absorbs any rounding remainder.
 * @param {number} remaining - amount to split (e.g. total - base)
 * @param {number} n - number of installments (>= 1)
 * @returns {number[]} array of N amounts, 2-decimal exact, summing to `remaining`
 */
export function splitInstallmentAmounts(remaining, n) {
  const cents = Math.round(Number(remaining) * 100);
  const each = Math.floor(cents / n);
  const remainder = cents - each * n;
  const amounts = [];
  for (let i = 0; i < n; i++) {
    const c = each + (i === n - 1 ? remainder : 0);
    amounts.push(c / 100);
  }
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
