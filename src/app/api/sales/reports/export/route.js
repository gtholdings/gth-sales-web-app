import { withAuth } from '@/lib/auth-middleware';
import {
  parseReportParams, resolveRange, resolveScopeRepIds,
  buildSalesReport, buildDefaulterReport,
} from '@/lib/reports';
import { buildSalesWorkbook, buildDefaulterWorkbook } from '@/lib/excel';
import { format } from 'date-fns';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/sales/reports/export
 * Same params as /api/sales/reports plus type=summary|defaulters.
 * Returns an .xlsx file. Gated to admin / supervisor / manager / finance.
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

    let buffer;
    if (params.type === 'defaulters') {
      buffer = await buildDefaulterWorkbook(await buildDefaulterReport({ supabaseAdmin, repIds, range }));
    } else {
      buffer = await buildSalesWorkbook(await buildSalesReport({ supabaseAdmin, repIds, range, groupBy: params.groupBy }));
    }

    const filename = `gth-${params.type}-${format(new Date(), 'yyyyMMdd-HHmm')}.xlsx`;
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('Report export error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
