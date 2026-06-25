import { describe, it, expect } from 'vitest';
import { formatRs } from '@/lib/format';

describe('formatRs', () => {
  it('formats thousands with two decimals', () => {
    expect(formatRs(1234.56)).toBe('Rs. 1,234.56');
  });

  it('formats large numbers with grouping', () => {
    expect(formatRs(1234567.5)).toBe('Rs. 1,234,567.50');
  });

  it('pads to two decimals', () => {
    expect(formatRs(1000)).toBe('Rs. 1,000.00');
  });

  it('formats zero', () => {
    expect(formatRs(0)).toBe('Rs. 0.00');
  });

  it('treats null/undefined as zero', () => {
    expect(formatRs(null)).toBe('Rs. 0.00');
    expect(formatRs(undefined)).toBe('Rs. 0.00');
  });

  it('formats negatives', () => {
    expect(formatRs(-2500.5)).toBe('Rs. -2,500.50');
  });

  it('rounds to two decimals', () => {
    expect(formatRs(1.005)).toBe('Rs. 1.01');
    expect(formatRs(2.344)).toBe('Rs. 2.34');
  });

  it('parses numeric strings', () => {
    expect(formatRs('4500')).toBe('Rs. 4,500.00');
  });

  it('renders NaN for non-numeric input (Number("abc") -> NaN)', () => {
    // Number('abc') is NaN; toLocaleString of NaN -> 'NaN'
    expect(formatRs('abc')).toBe('Rs. NaN');
  });
});
