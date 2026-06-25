import { describe, it, expect } from 'vitest';
import {
  toLocalMobile,
  isValidLKMobile,
  toE164,
  toAuthEmail,
  PHONE_FORMAT_HINT,
} from '@/lib/phone';

describe('toLocalMobile', () => {
  it('accepts a valid 07XXXXXXXX number', () => {
    expect(toLocalMobile('0771234567')).toBe('0771234567');
  });

  it('tolerates spaces and dashes', () => {
    expect(toLocalMobile('077-123 4567')).toBe('0771234567');
    expect(toLocalMobile(' 0 7 7 1 2 3 4 5 6 7 ')).toBe('0771234567');
  });

  it('rejects +94 / 94 / 0094 prefixed numbers (strict local only)', () => {
    expect(toLocalMobile('+94771234567')).toBeNull();
    expect(toLocalMobile('94771234567')).toBeNull();
    expect(toLocalMobile('0094771234567')).toBeNull();
  });

  it('rejects wrong length', () => {
    expect(toLocalMobile('077123456')).toBeNull(); // 9 digits
    expect(toLocalMobile('07712345678')).toBeNull(); // 11 digits
  });

  it('rejects non-07 prefix (landline / other)', () => {
    expect(toLocalMobile('0112345678')).toBeNull();
    expect(toLocalMobile('1771234567')).toBeNull();
  });

  it('rejects non-digit characters', () => {
    expect(toLocalMobile('07a1234567')).toBeNull();
  });

  it('handles null/undefined/empty input', () => {
    expect(toLocalMobile(null)).toBeNull();
    expect(toLocalMobile(undefined)).toBeNull();
    expect(toLocalMobile('')).toBeNull();
  });
});

describe('isValidLKMobile', () => {
  it('is true for a valid number', () => {
    expect(isValidLKMobile('0771234567')).toBe(true);
  });
  it('is false for an invalid number', () => {
    expect(isValidLKMobile('123')).toBe(false);
  });
});

describe('toE164', () => {
  it('converts a valid local number to +94...', () => {
    expect(toE164('0771234567')).toBe('+94771234567');
  });
  it('returns null for invalid input', () => {
    expect(toE164('123')).toBeNull();
    expect(toE164('+94771234567')).toBeNull();
  });
});

describe('toAuthEmail', () => {
  it('builds the synthetic auth email', () => {
    expect(toAuthEmail('0771234567')).toBe('0771234567@phone.gthsales.local');
  });
  it('returns null for invalid input', () => {
    expect(toAuthEmail('not-a-phone')).toBeNull();
  });
});

describe('PHONE_FORMAT_HINT', () => {
  it('is a non-empty human-readable hint mentioning 07', () => {
    expect(PHONE_FORMAT_HINT).toContain('07');
    expect(PHONE_FORMAT_HINT.length).toBeGreaterThan(10);
  });
});
