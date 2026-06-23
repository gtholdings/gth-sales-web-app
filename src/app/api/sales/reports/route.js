import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds, scopeSalesQuery } from '@/lib/scope-query';
import { parseReportParams, resolveRange, resolveScopeRepIds, buildSalesReport } from '@/lib/reports';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/sales/reports
 * Gated to rep / supervisor / manager / admin / credit_officer, scoped by the
 * user's hierarchy. Reps see only their own performance; supervisors/managers
 * can drill into individual subordinates via the filter params.
 *
 * Returns:
 *   { stats }  - all-time summary incl. success_rate (powers the dashboard cards).
 *   { report } - period-bucketed report for the requested range/filter, with
 *                paid/awaiting/pending/defaulted + running cumulative confirmed.
 *
 * Query params (for `report`): range=MTD|last_month|last_90|custom (default MTD),
 *   from/to when custom, groupBy=month|week, one of managerId|supervisorId|repId.
 */
export const GET = withAuth(['rep', 'supervisor', 'manager', 'admin', 'credit_officer'], async (request, { user, supabaseAdmin }) => {
  try {
    // ---- legacy all-time stats (powers the dashboard) ----
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);
    let q = supabaseAdmin.from('dialog_tv_sales').select('id, total_amount, status, payment_type');
    q = scopeSalesQuery(q, visibleRepIds);
    const { data: allSales, error } = await q;
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch sales data' }, { status: 500 });
    }
    const sales = allSales || [];

    // Total collectible (incl. interest) = sum of all installment amounts in scope.
    let totalCollectible = 0;
    const saleIds = sales.map((s) => s.id);
    for (let i = 0; i < saleIds.length; i += 400) {
      const { data: inst } = await supabaseAdmin
        .from('installments').select('amount').in('sale_id', saleIds.slice(i, i + 400));
      for (const it of inst || []) totalCollectible += Number(it.amount || 0);
    }

    const countBy = (st) => sales.filter((s) => s.status === st).length;
    // Success = the sale converted to a confirmed installation (down payment
    // collected) regardless of how far collection has progressed.
    const won = countBy('confirmed') + countBy('in_progress') + countBy('closed');
    const stats = {
      total_sales: sales.length,
      total_revenue: sales.reduce((s, x) => s + (Number(x.total_amount) || 0), 0),
      total_collectible: Math.round(totalCollectible * 100) / 100,
      success_rate: sales.length ? Math.round((won / sales.length) * 1000) / 10 : 0, // percent, 1 dp
      won_sales: won,
      by_status: {
        pending: countBy('pending'),
        confirmed: countBy('confirmed'),
        in_progress: countBy('in_progress'),
        closed: countBy('closed'),
        rejected: countBy('rejected'),
      },
      by_payment_type: sales.reduce((acc, s) => {
        const t = s.payment_type || 'null';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {}),
    };

    // ---- new range/period report ----
    const params = parseReportParams(request);
    let range;
    try {
      range = resolveRange(params);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const repIds = await resolveScopeRepIds(user, supabaseAdmin, params.filter);
    const report = await buildSalesReport({ supabaseAdmin, repIds, range, groupBy: params.groupBy });

    return NextResponse.json({ stats, report }, { status: 200 });
  } catch (error) {
    logger.error('Fetch reports error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
