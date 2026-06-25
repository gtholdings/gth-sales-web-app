import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveRange,
  bucketKey,
  resolveScopeRepIds,
  buildSalesReport,
  buildDefaulterReport,
  parseReportParams,
} from '@/lib/reports';
import { makeSupabase } from './_mockSupabase';

describe('resolveRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Colombo "now" = 2026-06-15 (UTC 2026-06-15T06:00 -> Colombo 11:30)
    vi.setSystemTime(new Date('2026-06-15T06:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('defaults to MTD (month start .. tomorrow exclusive)', () => {
    const r = resolveRange();
    expect(r.startYmd).toBe('2026-06-01');
    expect(r.endExclYmd).toBe('2026-06-16');
    expect(r.start.toISOString()).toBe('2026-05-31T18:30:00.000Z');
  });

  it('MTD explicitly', () => {
    expect(resolveRange({ range: 'MTD' }).startYmd).toBe('2026-06-01');
  });

  it('last_month spans the previous calendar month', () => {
    const r = resolveRange({ range: 'last_month' });
    expect(r.startYmd).toBe('2026-05-01');
    expect(r.endExclYmd).toBe('2026-06-01');
  });

  it('last_90 spans 90 days back .. tomorrow exclusive', () => {
    const r = resolveRange({ range: 'last_90' });
    expect(r.startYmd).toBe('2026-03-17'); // 2026-06-15 minus 90 days
    expect(r.endExclYmd).toBe('2026-06-16');
  });

  it('custom range uses from .. to+1', () => {
    const r = resolveRange({ range: 'custom', from: '2026-01-01', to: '2026-01-31' });
    expect(r.startYmd).toBe('2026-01-01');
    expect(r.endExclYmd).toBe('2026-02-01');
  });

  it('custom range throws without from/to', () => {
    expect(() => resolveRange({ range: 'custom', from: '2026-01-01' })).toThrow(/custom range requires/);
    expect(() => resolveRange({ range: 'custom', to: '2026-01-31' })).toThrow(/custom range requires/);
    expect(() => resolveRange({ range: 'custom' })).toThrow(/custom range requires/);
  });

  it('unknown range falls back to MTD', () => {
    expect(resolveRange({ range: 'bogus' }).startYmd).toBe('2026-06-01');
  });
});

describe('bucketKey', () => {
  it('month bucket in app tz', () => {
    expect(bucketKey('2026-06-15T06:00:00Z', 'month')).toBe('2026-06');
  });
  it('defaults to month', () => {
    expect(bucketKey('2026-06-15T06:00:00Z')).toBe('2026-06');
  });
  it('week bucket (ISO week)', () => {
    // 2026-06-15 is a Monday -> ISO week
    expect(bucketKey('2026-06-15T06:00:00Z', 'week')).toMatch(/^2026-W\d{2}$/);
  });
  it('rolls month using app tz (late UTC -> next Colombo day/month)', () => {
    // 2026-06-30 20:00 UTC -> Colombo 2026-07-01 01:30
    expect(bucketKey('2026-06-30T20:00:00Z', 'month')).toBe('2026-07');
  });
});

describe('resolveScopeRepIds', () => {
  it("returns visible ids when no filter ('*' admin)", async () => {
    const sb = makeSupabase();
    const out = await resolveScopeRepIds({ id: 'a', role: 'admin' }, sb, {});
    expect(out).toBe('*');
  });

  it('repId filter under admin returns just that rep', async () => {
    const sb = makeSupabase();
    const out = await resolveScopeRepIds({ id: 'a', role: 'admin' }, sb, { repId: 'rep-9' });
    expect(out).toEqual(['rep-9']);
  });

  it('repId filter intersected with a limited visible set', async () => {
    const sb = makeSupabase();
    // supervisor visible = [sup-1, r1, r2]
    sb.stage('profiles', { data: [{ id: 'r1' }, { id: 'r2' }], error: null });
    const out = await resolveScopeRepIds({ id: 'sup-1', role: 'supervisor' }, sb, { repId: 'r1' });
    expect(out).toEqual(['r1']);
  });

  it('repId outside the visible set is filtered out (empty)', async () => {
    const sb = makeSupabase();
    sb.stage('profiles', { data: [{ id: 'r1' }], error: null });
    const out = await resolveScopeRepIds({ id: 'sup-1', role: 'supervisor' }, sb, { repId: 'rX' });
    expect(out).toEqual([]);
  });

  it('supervisorId filter resolves that supervisor scope, capped by visible', async () => {
    // admin user -> visible '*' (no query); supervisor filter -> profiles query for reps
    const sb = makeSupabase();
    sb.stage('profiles', { data: [{ id: 'r1' }, { id: 'r2' }], error: null });
    const out = await resolveScopeRepIds({ id: 'admin', role: 'admin' }, sb, { supervisorId: 'sup-7' });
    expect(out).toEqual(['sup-7', 'r1', 'r2']);
  });

  it('managerId filter resolves that manager scope', async () => {
    const sb = makeSupabase();
    sb.queue([
      { data: [{ id: 'sup-1' }], error: null }, // supervisors under the filter manager
      { data: [{ id: 'r1' }], error: null },    // reps under those supervisors
    ]);
    const out = await resolveScopeRepIds({ id: 'admin', role: 'admin' }, sb, { managerId: 'mgr-3' });
    expect(out).toEqual(['mgr-3', 'sup-1', 'r1']);
  });
});

describe('buildSalesReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T06:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const range = {
    start: new Date('2026-05-31T18:30:00.000Z'),
    end: new Date('2026-06-16T18:30:00.000Z'),
    startYmd: '2026-06-01',
    endExclYmd: '2026-06-16',
  };

  it('aggregates confirmed totals, collectible, interest, and payment splits', async () => {
    const sb = makeSupabase();
    // sales: one confirmed (counts to confirmed_total), one pending (does not)
    sb.stage('dialog_tv_sales', {
      data: [
        { id: 's1', rep_id: 'r1', total_amount: 10000, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' },
        { id: 's2', rep_id: 'r1', total_amount: 5000, status: 'pending', created_at: '2026-06-06T03:00:00Z' },
      ],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null }); // threshold (single)
    sb.stage('installments', {
      data: [
        // s1: down payment paid, one installment awaiting, one pending future, one defaulted
        { sale_id: 's1', amount: 2000, paid_amount: 2000, status: 'paid', due_date: '2026-06-05' },
        { sale_id: 's1', amount: 3000, paid_amount: 3000, status: 'awaiting_confirmation', due_date: '2026-06-10' },
        { sale_id: 's1', amount: 4000, paid_amount: 0, status: 'pending', due_date: '2026-07-05' },
        { sale_id: 's1', amount: 2000, paid_amount: 0, status: 'pending', due_date: '2026-01-01' }, // long overdue -> defaulted
        // s2 installments (pending sale, but installments still aggregate into collectible splits)
        { sale_id: 's2', amount: 1000, paid_amount: 0, status: 'pending', due_date: '2026-06-14' }, // 1 day overdue -> pending bucket
      ],
      error: null,
    });

    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range, groupBy: 'month' });

    expect(out.range).toEqual({ start: '2026-06-01', end: '2026-06-16', groupBy: 'month' });
    expect(out.periods).toHaveLength(1);
    const p = out.periods[0];
    expect(p.period).toBe('2026-06');
    expect(p.num_sales).toBe(2);
    expect(p.confirmed_sale_total).toBe(10000); // only s1 confirmed
    expect(p.collectible_total).toBe(2000 + 3000 + 4000 + 2000 + 1000); // 12000
    expect(p.amount_paid).toBe(2000);
    expect(p.amount_awaiting).toBe(3000);
    expect(p.amount_defaulted).toBe(2000); // the long-overdue one
    expect(p.amount_pending).toBe(4000 + 1000); // future pending + overdue<=threshold
    expect(p.cumulative_confirmed_total).toBe(10000);
    expect(p.interest_total).toBe(2000); // 12000 collectible - 10000 confirmed
    expect(out.totals.num_sales).toBe(2);
    expect(out.totals.interest_total).toBe(2000);
  });

  it('interest_total floors at zero when collectible < confirmed', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: 10000, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', {
      data: [{ sale_id: 's1', amount: 1000, paid_amount: 0, status: 'pending', due_date: '2026-07-05' }],
      error: null,
    });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.periods[0].interest_total).toBe(0);
  });

  it('uses default threshold 30 when config missing / NaN', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: 100, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: 'not-a-number' }, error: null });
    sb.stage('installments', {
      // 31 days overdue (> default 30) -> defaulted
      data: [{ sale_id: 's1', amount: 100, paid_amount: 0, status: 'pending', due_date: '2026-05-15' }],
      error: null,
    });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.periods[0].amount_defaulted).toBe(100);
  });

  it('handles an empty sales set', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', { data: [], error: null });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', { data: [], error: null });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.periods).toEqual([]);
    expect(out.totals.num_sales).toBe(0);
  });

  it('treats a null sales result as empty', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', { data: null, error: null }); // fetchSales -> data || []
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', { data: [], error: null });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.periods).toEqual([]);
    expect(out.totals.num_sales).toBe(0);
  });

  it('falls back total_amount to 0 for a confirmed sale with null total', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: null, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', { data: [], error: null });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.periods[0].confirmed_sale_total).toBe(0);
  });

  it('groups by week when requested and sorts periods', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [
        { id: 's1', rep_id: 'r1', total_amount: 100, status: 'closed', created_at: '2026-06-01T03:00:00Z' },
        { id: 's2', rep_id: 'r1', total_amount: 200, status: 'closed', created_at: '2026-06-08T03:00:00Z' },
      ],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', { data: [], error: null });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range, groupBy: 'week' });
    expect(out.periods.length).toBe(2);
    expect(out.range.groupBy).toBe('week');
    // cumulative is monotonic across sorted periods
    expect(out.periods[1].cumulative_confirmed_total).toBe(300);
  });

  it('falls back amount/paid to 0 when missing, and paid uses amount when paid_amount is 0', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: 100, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', {
      data: [
        // paid but paid_amount 0 -> amount_paid uses amount (paid || amt branch)
        { sale_id: 's1', status: 'paid', amount: 500, paid_amount: 0, due_date: '2026-06-05' },
        // awaiting with null paid_amount -> amount_awaiting uses amount
        { sale_id: 's1', status: 'awaiting_confirmation', amount: 300, paid_amount: null, due_date: '2026-06-10' },
        // pending with missing amount/paid -> contributes 0
        { sale_id: 's1', status: 'pending', due_date: '2026-07-05' },
      ],
      error: null,
    });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range });
    const p = out.periods[0];
    expect(p.amount_paid).toBe(500);     // paid || amt -> amt
    expect(p.amount_awaiting).toBe(300); // paid || amt -> amt
    expect(p.collectible_total).toBe(800); // 500 + 300 + 0
    expect(p.amount_pending).toBe(0);    // missing amount/paid -> 0 - 0
  });

  it('counts an installment whose sale is not in the bucket map as skipped', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: 100, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', {
      data: [
        { sale_id: 's1', amount: 100, paid_amount: 100, status: 'paid', due_date: '2026-06-05' },
        { sale_id: 'ghost', amount: 999, paid_amount: 0, status: 'pending', due_date: '2026-06-05' },
      ],
      error: null,
    });
    const out = await buildSalesReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.periods[0].collectible_total).toBe(100); // ghost skipped
  });
});

describe('buildDefaulterReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T06:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const range = {
    start: new Date('2026-05-31T18:30:00.000Z'),
    end: new Date('2026-06-16T18:30:00.000Z'),
    startYmd: '2026-06-01',
    endExclYmd: '2026-06-16',
  };

  it('aggregates defaulted amounts per rep, sorted desc, with names', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [
        { id: 's1', rep_id: 'r1', total_amount: 0, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' },
        { id: 's2', rep_id: 'r2', total_amount: 0, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' },
      ],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', {
      data: [
        // r1: two defaulted (old + older), one non-defaulted
        { sale_id: 's1', amount: 1000, paid_amount: 200, status: 'pending', due_date: '2026-02-01' },
        { sale_id: 's1', amount: 500, paid_amount: 0, status: 'pending', due_date: '2026-01-01' },
        { sale_id: 's1', amount: 300, paid_amount: 0, status: 'pending', due_date: '2026-07-01' }, // future -> not defaulted
        // r2: one defaulted (smaller)
        { sale_id: 's2', amount: 400, paid_amount: 0, status: 'pending', due_date: '2026-03-01' },
        // unknown sale -> skipped
        { sale_id: 'ghost', amount: 9999, paid_amount: 0, status: 'pending', due_date: '2026-01-01' },
      ],
      error: null,
    });
    sb.stage('profiles', { data: [{ id: 'r1', full_name: 'Rep One' }], error: null });

    const out = await buildDefaulterReport({ supabaseAdmin: sb, repIds: '*', range });

    expect(out.range).toEqual({ start: '2026-06-01', end: '2026-06-16' });
    expect(out.rows).toHaveLength(2);
    // r1 first (larger amount: 800 + 500 = 1300), r2 (400)
    expect(out.rows[0].rep_id).toBe('r1');
    expect(out.rows[0].rep_name).toBe('Rep One');
    expect(out.rows[0].defaulted_count).toBe(2);
    expect(out.rows[0].defaulted_amount).toBe(1300); // (1000-200)+(500-0)
    expect(out.rows[0].oldest_due_date).toBe('2026-01-01');
    expect(out.rows[1].rep_id).toBe('r2');
    expect(out.rows[1].rep_name).toBe('Unknown'); // name not in profiles
    expect(out.rows[1].defaulted_amount).toBe(400);
    expect(out.total_defaulted_amount).toBe(1700);
  });

  it('returns empty rows when nothing is defaulted (skips profile lookup)', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: 0, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', {
      data: [{ sale_id: 's1', amount: 100, paid_amount: 0, status: 'pending', due_date: '2026-07-05' }],
      error: null,
    });
    const out = await buildDefaulterReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.rows).toEqual([]);
    expect(out.total_defaulted_amount).toBe(0);
    // no profiles query was made
    expect(sb.calls.some((c) => c.table === 'profiles')).toBe(false);
  });

  it('falls back amount/paid to 0 for a defaulted installment missing those fields', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: 0, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', {
      // defaulted (Jan 1 due) but amount/paid_amount omitted -> 0 - 0
      data: [{ sale_id: 's1', status: 'pending', due_date: '2026-01-01' }],
      error: null,
    });
    sb.stage('profiles', { data: [{ id: 'r1', full_name: 'Rep One' }], error: null });
    const out = await buildDefaulterReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.rows[0].defaulted_count).toBe(1);
    expect(out.rows[0].defaulted_amount).toBe(0);
    expect(out.total_defaulted_amount).toBe(0);
  });

  it('handles null profiles data gracefully', async () => {
    const sb = makeSupabase();
    sb.stage('dialog_tv_sales', {
      data: [{ id: 's1', rep_id: 'r1', total_amount: 0, status: 'confirmed', created_at: '2026-06-05T03:00:00Z' }],
      error: null,
    });
    sb.stage('app_config', { data: { value: '30' }, error: null });
    sb.stage('installments', {
      data: [{ sale_id: 's1', amount: 100, paid_amount: 0, status: 'pending', due_date: '2026-01-01' }],
      error: null,
    });
    sb.stage('profiles', { data: null, error: null });
    const out = await buildDefaulterReport({ supabaseAdmin: sb, repIds: '*', range });
    expect(out.rows[0].rep_name).toBe('Unknown');
  });
});

describe('parseReportParams', () => {
  const req = (qs) => ({ url: `https://x.test/api/reports${qs}` });

  it('defaults: MTD/month/summary, no filter', () => {
    expect(parseReportParams(req(''))).toEqual({
      range: 'MTD', from: undefined, to: undefined, groupBy: 'month', filter: {}, type: 'summary',
    });
  });

  it('reads range/from/to/groupBy/type', () => {
    const out = parseReportParams(req('?range=custom&from=2026-01-01&to=2026-01-31&groupBy=week&type=defaulters'));
    expect(out).toEqual({
      range: 'custom', from: '2026-01-01', to: '2026-01-31', groupBy: 'week', filter: {}, type: 'defaulters',
    });
  });

  it('repId filter wins over supervisor/manager', () => {
    const out = parseReportParams(req('?repId=r1&supervisorId=s1&managerId=m1'));
    expect(out.filter).toEqual({ repId: 'r1' });
  });

  it('supervisorId used when no repId', () => {
    expect(parseReportParams(req('?supervisorId=s1&managerId=m1')).filter).toEqual({ supervisorId: 's1' });
  });

  it('managerId used when only manager given', () => {
    expect(parseReportParams(req('?managerId=m1')).filter).toEqual({ managerId: 'm1' });
  });

  it('non-week groupBy normalizes to month; non-defaulters type to summary', () => {
    const out = parseReportParams(req('?groupBy=day&type=other'));
    expect(out.groupBy).toBe('month');
    expect(out.type).toBe('summary');
  });
});
