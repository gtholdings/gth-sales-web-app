import { startOfMonth, subMonths, subDays, addDays, format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getVisibleRepIds, scopeSalesQuery } from '@/lib/scope-query';
import { installmentDisplayStatus } from '@/lib/installments';
import { APP_TZ, appNow, zonedDayStart } from '@/lib/datetime';

/**
 * Shared reporting logic — single source of truth for the JSON report route,
 * the defaulter route, and the Excel export route so they never diverge.
 *
 * All day boundaries are computed in app timezone (Asia/Colombo) then converted
 * to UTC instants for filtering timestamptz columns.
 */

const ymd = (d) => format(d, 'yyyy-MM-dd');

/** Resolve a named/custom range to {start,end} UTC instants (end exclusive). */
export function resolveRange({ range = 'MTD', from, to } = {}) {
  const now = appNow();
  const todayYmd = ymd(now);
  let startYmd, endExclYmd;

  switch (range) {
    case 'last_month': {
      startYmd = ymd(startOfMonth(subMonths(now, 1)));
      endExclYmd = ymd(startOfMonth(now));
      break;
    }
    case 'last_90': {
      startYmd = ymd(subDays(now, 90));
      endExclYmd = ymd(addDays(parseISO(todayYmd), 1));
      break;
    }
    case 'custom': {
      if (!from || !to) throw new Error('custom range requires from and to (YYYY-MM-DD)');
      startYmd = from;
      endExclYmd = ymd(addDays(parseISO(to), 1));
      break;
    }
    case 'MTD':
    default: {
      startYmd = ymd(startOfMonth(now));
      endExclYmd = ymd(addDays(parseISO(todayYmd), 1));
    }
  }
  return { start: zonedDayStart(startYmd), end: zonedDayStart(endExclYmd), startYmd, endExclYmd };
}

/**
 * Rep-id set for the report: getVisibleRepIds (hard ceiling) intersected with an
 * optional manager/teamLead/rep filter. Never widens beyond what the user can see.
 * Returns '*' or an array.
 */
export async function resolveScopeRepIds(user, supabaseAdmin, filter = {}) {
  const visible = await getVisibleRepIds(user, supabaseAdmin);

  let target = null;
  if (filter.repId) target = [filter.repId];
  else if (filter.teamLeadId) target = await getVisibleRepIds({ id: filter.teamLeadId, role: 'team_lead' }, supabaseAdmin);
  else if (filter.managerId) target = await getVisibleRepIds({ id: filter.managerId, role: 'manager' }, supabaseAdmin);

  if (!target) return visible;
  if (visible === '*') return target;
  const vset = new Set(visible);
  return target.filter((id) => vset.has(id));
}

/** Period bucket key for a UTC timestamp, in app tz. */
export function bucketKey(utcIso, groupBy = 'month') {
  const z = toZonedTime(parseISO(utcIso), APP_TZ);
  return groupBy === 'week' ? format(z, "RRRR-'W'II") : format(z, 'yyyy-MM');
}

// Fetch installments for sale ids, chunked to keep the PostgREST URL bounded.
async function fetchInstallments(supabaseAdmin, saleIds) {
  const out = [];
  for (let i = 0; i < saleIds.length; i += 400) {
    const chunk = saleIds.slice(i, i + 400);
    const { data } = await supabaseAdmin
      .from('installments')
      .select('sale_id, amount, paid_amount, status, due_date')
      .in('sale_id', chunk);
    if (data) out.push(...data);
  }
  return out;
}

async function getThreshold(supabaseAdmin) {
  const { data } = await supabaseAdmin.from('app_config').select('value').eq('key', 'default_days_threshold').single();
  const n = Number(data?.value);
  return Number.isFinite(n) ? n : 30;
}

const CONFIRMED = new Set(['approved', 'completed']);

// Fetch the scoped sales for a range. repIds '*' or array.
async function fetchSales(supabaseAdmin, repIds, range) {
  let q = supabaseAdmin
    .from('dialog_tv_sales')
    .select('id, rep_id, total_amount, status, created_at');
  q = scopeSalesQuery(q, repIds);
  q = q.gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString());
  const { data } = await q;
  return data || [];
}

function emptyBucket(period) {
  return {
    period, num_sales: 0, confirmed_sale_total: 0,
    amount_paid: 0, amount_awaiting: 0, amount_pending: 0, amount_defaulted: 0,
  };
}

/** Summary report grouped by month/week. */
export async function buildSalesReport({ supabaseAdmin, repIds, range, groupBy = 'month' }) {
  const sales = await fetchSales(supabaseAdmin, repIds, range);
  const threshold = await getThreshold(supabaseAdmin);
  const today = appNow();

  const saleBucket = new Map(); // sale_id -> bucket key
  const buckets = new Map();    // key -> aggregate
  const ensure = (k) => { if (!buckets.has(k)) buckets.set(k, emptyBucket(k)); return buckets.get(k); };

  for (const s of sales) {
    const key = bucketKey(s.created_at, groupBy);
    saleBucket.set(s.id, key);
    const b = ensure(key);
    b.num_sales += 1;
    if (CONFIRMED.has(s.status)) b.confirmed_sale_total += Number(s.total_amount || 0);
  }

  const installments = await fetchInstallments(supabaseAdmin, [...saleBucket.keys()]);
  for (const it of installments) {
    const key = saleBucket.get(it.sale_id);
    if (!key) continue;
    const b = ensure(key);
    const eff = installmentDisplayStatus(it, threshold, today);
    const amt = Number(it.amount || 0);
    const paid = Number(it.paid_amount || 0);
    if (eff === 'paid') b.amount_paid += paid || amt;
    else if (eff === 'awaiting_confirmation') b.amount_awaiting += paid || amt;
    else if (eff === 'defaulted') b.amount_defaulted += amt - paid;
    else b.amount_pending += amt - paid; // pending or overdue
  }

  const periods = [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  let cumulative = 0;
  for (const p of periods) {
    cumulative += p.confirmed_sale_total;
    p.cumulative_confirmed_total = cumulative;
  }

  const totals = periods.reduce((t, p) => {
    t.num_sales += p.num_sales;
    t.confirmed_sale_total += p.confirmed_sale_total;
    t.amount_paid += p.amount_paid;
    t.amount_awaiting += p.amount_awaiting;
    t.amount_pending += p.amount_pending;
    t.amount_defaulted += p.amount_defaulted;
    return t;
  }, { num_sales: 0, confirmed_sale_total: 0, amount_paid: 0, amount_awaiting: 0, amount_pending: 0, amount_defaulted: 0 });

  return { range: { start: range.startYmd, end: range.endExclYmd, groupBy }, periods, totals };
}

/** Per-rep defaulted-amount report. */
export async function buildDefaulterReport({ supabaseAdmin, repIds, range }) {
  const sales = await fetchSales(supabaseAdmin, repIds, range);
  const threshold = await getThreshold(supabaseAdmin);
  const today = appNow();
  const saleRep = new Map(sales.map((s) => [s.id, s.rep_id]));

  const installments = await fetchInstallments(supabaseAdmin, [...saleRep.keys()]);
  const byRep = new Map(); // rep_id -> {count, amount, oldest}
  for (const it of installments) {
    if (installmentDisplayStatus(it, threshold, today) !== 'defaulted') continue;
    const repId = saleRep.get(it.sale_id);
    if (!repId) continue;
    if (!byRep.has(repId)) byRep.set(repId, { defaulted_count: 0, defaulted_amount: 0, oldest_due_date: it.due_date });
    const r = byRep.get(repId);
    r.defaulted_count += 1;
    r.defaulted_amount += Number(it.amount || 0) - Number(it.paid_amount || 0);
    if (it.due_date < r.oldest_due_date) r.oldest_due_date = it.due_date;
  }

  // Resolve rep names.
  const repIdList = [...byRep.keys()];
  const names = new Map();
  if (repIdList.length) {
    const { data } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', repIdList);
    for (const p of data || []) names.set(p.id, p.full_name);
  }

  const rows = repIdList
    .map((id) => ({ rep_id: id, rep_name: names.get(id) || 'Unknown', ...byRep.get(id) }))
    .sort((a, b) => b.defaulted_amount - a.defaulted_amount);

  const total_defaulted_amount = rows.reduce((s, r) => s + r.defaulted_amount, 0);
  return { range: { start: range.startYmd, end: range.endExclYmd }, rows, total_defaulted_amount };
}

/** Parse report query params from a Request URL into a normalized object. */
export function parseReportParams(request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || 'MTD';
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const groupBy = searchParams.get('groupBy') === 'week' ? 'week' : 'month';
  const filter = {};
  if (searchParams.get('repId')) filter.repId = searchParams.get('repId');
  else if (searchParams.get('teamLeadId')) filter.teamLeadId = searchParams.get('teamLeadId');
  else if (searchParams.get('managerId')) filter.managerId = searchParams.get('managerId');
  const type = searchParams.get('type') === 'defaulters' ? 'defaulters' : 'summary';
  return { range, from, to, groupBy, filter, type };
}
