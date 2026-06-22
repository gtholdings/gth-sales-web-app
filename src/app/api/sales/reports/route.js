import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds, scopeSalesQuery } from '@/lib/scope-query';
import { parseReportParams, resolveRange, resolveScopeRepIds, buildSalesReport } from '@/lib/reports';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/sales/reports
 * Gated to manager / admin / finance, scoped by the user's hierarchy.
 *
 * Returns:
 *   { stats }  - legacy all-time summary (kept for the dashboard StatsCards).
 *   { report } - period-bucketed report for the requested range/filter, with
 *                paid/awaiting/pending/defaulted + running cumulative confirmed.
 *
 * Query params (for `report`): range=MTD|last_month|last_90|custom (default MTD),
 *   from/to when custom, groupBy=month|week, one of managerId|supervisorId|repId.
 */
export const GET = withAuth(['supervisor', 'manager', 'admin', 'finance'], async (request, { user, supabaseAdmin }) => {
  try {
    // ---- legacy all-time stats (unchanged shape; powers the dashboard) ----
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);
    let q = supabaseAdmin.from('dialog_tv_sales').select('total_amount, status, payment_type');
    q = scopeSalesQuery(q, visibleRepIds);
    const { data: allSales, error } = await q;
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch sales data' }, { status: 500 });
    }
    const sales = allSales || [];
    const stats = {
      total_sales: sales.length,
      total_revenue: sales.reduce((s, x) => s + (Number(x.total_amount) || 0), 0),
      by_status: {
        pending: sales.filter((s) => s.status === 'pending').length,
        approved: sales.filter((s) => s.status === 'approved').length,
        completed: sales.filter((s) => s.status === 'completed').length,
        rejected: sales.filter((s) => s.status === 'rejected').length,
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
