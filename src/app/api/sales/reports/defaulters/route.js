import { withAuth } from '@/lib/auth-middleware';
import { parseReportParams, resolveRange, resolveScopeRepIds, buildDefaulterReport } from '@/lib/reports';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/sales/reports/defaulters
 * Per-rep defaulted amount (rep's responsibility), for the requested range/scope.
 * Gated to admin / supervisor / manager / finance.
 */
export const GET = withAuth(['admin', 'supervisor', 'manager', 'finance'], async (request, { user, supabaseAdmin }) => {
  try {
    const params = parseReportParams(request);
    let range;
    try {
      range = resolveRange(params);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const repIds = await resolveScopeRepIds(user, supabaseAdmin, params.filter);
    const report = await buildDefaulterReport({ supabaseAdmin, repIds, range });
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    logger.error('Defaulter report error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
