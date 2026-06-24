import { describe, it, expect, vi } from 'vitest';
import {
  SALE_STATUSES,
  ACTIVE_SALE_STATUSES,
  deriveScheduledStatus,
  effectiveSaleStatus,
  recomputeSaleStatus,
} from '@/lib/sale-status';
import { makeSupabase } from './_mockSupabase';

describe('constants', () => {
  it('exports the full status set', () => {
    expect(SALE_STATUSES).toEqual(['pending', 'confirmed', 'in_progress', 'closed', 'rejected']);
  });
  it('exports active statuses', () => {
    expect(ACTIVE_SALE_STATUSES).toEqual(['confirmed', 'in_progress', 'closed']);
  });
});

describe('deriveScheduledStatus', () => {
  it('confirmed for empty / non-array input', () => {
    expect(deriveScheduledStatus([])).toBe('confirmed');
    expect(deriveScheduledStatus(null)).toBe('confirmed');
    expect(deriveScheduledStatus(undefined)).toBe('confirmed');
  });

  it('confirmed when none paid', () => {
    expect(deriveScheduledStatus([{ status: 'pending' }, { status: 'awaiting_confirmation' }])).toBe('confirmed');
  });

  it('in_progress when some but not all paid', () => {
    expect(deriveScheduledStatus([{ status: 'paid' }, { status: 'pending' }])).toBe('in_progress');
  });

  it('closed when all paid', () => {
    expect(deriveScheduledStatus([{ status: 'paid' }, { status: 'paid' }])).toBe('closed');
  });
});

describe('effectiveSaleStatus', () => {
  it('pending is sticky', () => {
    expect(effectiveSaleStatus('pending', [{ status: 'paid' }])).toBe('pending');
  });
  it('rejected is sticky', () => {
    expect(effectiveSaleStatus('rejected', [{ status: 'paid' }])).toBe('rejected');
  });
  it('derives for active base statuses', () => {
    expect(effectiveSaleStatus('confirmed', [{ status: 'paid' }, { status: 'pending' }])).toBe('in_progress');
    expect(effectiveSaleStatus('closed', [])).toBe('confirmed');
  });
});

describe('recomputeSaleStatus', () => {
  it('returns null and no-ops for a pending sale', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', { data: [{ status: 'pending' }], error: null });
    const result = await recomputeSaleStatus('sale-1', sb);
    expect(result).toBeNull();
    // no update issued
    expect(sb.calls.some((c) => c.method === 'update')).toBe(false);
  });

  it('returns null for a rejected sale', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', { data: [{ status: 'rejected' }], error: null });
    expect(await recomputeSaleStatus('sale-1', sb)).toBeNull();
  });

  it('returns null when the sale is not found', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', { data: [], error: null }); // single -> null
    expect(await recomputeSaleStatus('missing', sb)).toBeNull();
  });

  it('returns null when status is unchanged (no write)', async () => {
    const sb = makeSupabase();
    // first .from() resolves the sale; second resolves installments
    sb.queue([
      { data: { status: 'confirmed' }, error: null },   // sale (single)
      { data: [{ status: 'pending' }], error: null },   // installments -> derive confirmed
    ]);
    const result = await recomputeSaleStatus('sale-1', sb);
    expect(result).toBeNull();
    expect(sb.calls.some((c) => c.method === 'update')).toBe(false);
  });

  it('persists and returns the new status when it changes', async () => {
    const sb = makeSupabase();
    sb.queue([
      { data: { status: 'confirmed' }, error: null },              // sale (single)
      { data: [{ status: 'paid' }, { status: 'pending' }], error: null }, // -> in_progress
      { data: null, error: null },                                  // update result
    ]);
    const result = await recomputeSaleStatus('sale-1', sb);
    expect(result).toBe('in_progress');
    const updateCall = sb.calls.find((c) => c.method === 'update');
    expect(updateCall).toBeTruthy();
    expect(updateCall.args[0].status).toBe('in_progress');
    expect(typeof updateCall.args[0].updated_at).toBe('string');
  });

  it('persists closed when all installments are paid', async () => {
    const sb = makeSupabase();
    sb.queue([
      { data: { status: 'in_progress' }, error: null },
      { data: [{ status: 'paid' }, { status: 'paid' }], error: null },
      { data: null, error: null },
    ]);
    expect(await recomputeSaleStatus('sale-1', sb)).toBe('closed');
  });
});
