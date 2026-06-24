import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APP_TZ, appNow, appTodayYMD, zonedDayStart } from '@/lib/datetime';

describe('datetime (Asia/Colombo, UTC+05:30)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the app timezone', () => {
    expect(APP_TZ).toBe('Asia/Colombo');
  });

  it('appNow returns Colombo wall-clock (UTC + 5:30)', () => {
    // 2026-06-15 20:00 UTC -> Colombo 2026-06-16 01:30
    vi.setSystemTime(new Date('2026-06-15T20:00:00Z'));
    const now = appNow();
    expect(now.getFullYear()).toBe(2026);
    expect(now.getMonth()).toBe(5); // June (0-based)
    expect(now.getDate()).toBe(16);
    expect(now.getHours()).toBe(1);
    expect(now.getMinutes()).toBe(30);
  });

  it('appTodayYMD rolls to the next day when Colombo is past midnight but UTC is not', () => {
    // 2026-06-15 19:00 UTC -> Colombo 2026-06-16 00:30
    vi.setSystemTime(new Date('2026-06-15T19:00:00Z'));
    expect(appTodayYMD()).toBe('2026-06-16');
  });

  it('appTodayYMD same calendar day mid-afternoon UTC', () => {
    vi.setSystemTime(new Date('2026-06-15T06:00:00Z')); // Colombo 11:30
    expect(appTodayYMD()).toBe('2026-06-15');
  });

  it('zonedDayStart converts a Colombo midnight to the right UTC instant', () => {
    // Colombo midnight 2026-06-01 00:00 == 2026-05-31 18:30 UTC
    const utc = zonedDayStart('2026-06-01');
    expect(utc.toISOString()).toBe('2026-05-31T18:30:00.000Z');
  });
});
