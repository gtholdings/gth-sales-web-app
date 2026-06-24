import { describe, it, expect } from 'vitest';
import {
  totalRepayable,
  splitInstallmentAmounts,
  installmentDueDates,
  installmentDisplayStatus,
} from '@/lib/installments';

describe('totalRepayable', () => {
  it('adds flat interest of (rate × n)', () => {
    expect(totalRepayable(5000, 2, 10)).toBe(6000); // 5000 × 1.2
    expect(totalRepayable(5000, 3, 10)).toBe(6500); // 5000 × 1.3
  });

  it('returns principal unchanged at 0% interest', () => {
    expect(totalRepayable(5000, 6, 0)).toBe(5000);
  });

  it('treats missing/undefined interest as 0%', () => {
    expect(totalRepayable(1000, 4, undefined)).toBe(1000);
    expect(totalRepayable(1000, 4, null)).toBe(1000);
  });

  it('rounds to two decimals', () => {
    // 3333.33 × (1 + 0.075×1) = 3333.33 × 1.075 = 3583.32975 -> 3583.33
    expect(totalRepayable(3333.33, 1, 7.5)).toBe(3583.33);
  });

  it('handles zero principal', () => {
    expect(totalRepayable(0, 5, 10)).toBe(0);
  });

  it('coerces numeric strings', () => {
    expect(totalRepayable('1000', '2', '10')).toBe(1200);
  });
});

describe('splitInstallmentAmounts', () => {
  it('puts the rounding remainder on the LAST installment', () => {
    expect(splitInstallmentAmounts(6500, 3)).toEqual([2166.67, 2166.67, 2166.66]);
  });

  it('sums exactly to the total', () => {
    const parts = splitInstallmentAmounts(6500, 3);
    const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum).toBe(6500);
  });

  it('splits evenly when divisible', () => {
    expect(splitInstallmentAmounts(6000, 3)).toEqual([2000, 2000, 2000]);
  });

  it('handles n = 1 (single installment is the whole total)', () => {
    expect(splitInstallmentAmounts(1234.56, 1)).toEqual([1234.56]);
  });

  it('coerces numeric string total', () => {
    expect(splitInstallmentAmounts('100', 2)).toEqual([50, 50]);
  });
});

describe('installmentDueDates', () => {
  it('returns N monthly dates anchored after the down-payment date (excl. anchor)', () => {
    expect(installmentDueDates('2026-01-15', 3)).toEqual([
      '2026-02-15', '2026-03-15', '2026-04-15',
    ]);
  });

  it('clamps Jan 31 to Feb 28 in a non-leap year', () => {
    // 2026 is not a leap year
    expect(installmentDueDates('2026-01-31', 1)).toEqual(['2026-02-28']);
  });

  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    // 2024 is a leap year
    expect(installmentDueDates('2024-01-31', 1)).toEqual(['2024-02-29']);
  });

  it('clamps May 31 to Jun 30', () => {
    expect(installmentDueDates('2026-05-31', 1)).toEqual(['2026-06-30']);
  });

  it('accepts a Date object as the anchor', () => {
    expect(installmentDueDates(new Date(2026, 0, 15), 2)).toEqual([
      '2026-02-15', '2026-03-15',
    ]);
  });

  it('returns an empty array for n = 0', () => {
    expect(installmentDueDates('2026-01-15', 0)).toEqual([]);
  });
});

describe('installmentDisplayStatus', () => {
  const today = new Date('2026-06-15T00:00:00');

  it('passes through paid', () => {
    expect(installmentDisplayStatus({ status: 'paid', due_date: '2020-01-01' }, 30, today)).toBe('paid');
  });

  it('passes through awaiting_confirmation', () => {
    expect(installmentDisplayStatus({ status: 'awaiting_confirmation', due_date: '2020-01-01' }, 30, today)).toBe('awaiting_confirmation');
  });

  it('returns pending when due_date is missing', () => {
    expect(installmentDisplayStatus({ status: 'pending', due_date: null }, 30, today)).toBe('pending');
  });

  it('returns pending when not yet due (due in the future)', () => {
    expect(installmentDisplayStatus({ status: 'pending', due_date: '2026-07-15' }, 30, today)).toBe('pending');
  });

  it('returns pending when due exactly today (0 days past)', () => {
    expect(installmentDisplayStatus({ status: 'pending', due_date: '2026-06-15' }, 30, today)).toBe('pending');
  });

  it('returns overdue when 1..threshold days past due', () => {
    expect(installmentDisplayStatus({ status: 'pending', due_date: '2026-06-14' }, 30, today)).toBe('overdue');
    // exactly threshold days past -> still overdue (boundary: > threshold needed for defaulted)
    expect(installmentDisplayStatus({ status: 'pending', due_date: '2026-05-16' }, 30, today)).toBe('overdue'); // 30 days
  });

  it('returns defaulted when more than threshold days past due', () => {
    expect(installmentDisplayStatus({ status: 'pending', due_date: '2026-05-15' }, 30, today)).toBe('defaulted'); // 31 days
  });

  it('respects a custom threshold', () => {
    expect(installmentDisplayStatus({ status: 'overdue', due_date: '2026-06-10' }, 3, today)).toBe('defaulted'); // 5 days > 3
    expect(installmentDisplayStatus({ status: 'overdue', due_date: '2026-06-13' }, 3, today)).toBe('overdue'); // 2 days
  });
});
