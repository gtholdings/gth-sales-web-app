import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds, scopeSalesQuery } from '@/lib/scope-query';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/sales/reports
 * Protected endpoint (manager, admin, finance only) - returns aggregated sales summary
 *
 * Headers: Authorization: Bearer {token}
 *
 * Response: {
 *   total_sales: number
 *   total_revenue: number
 *   by_status: {
 *     pending: number
 *     approved: number
 *     rejected: number
 *   }
 *   by_payment_type: {
 *     cash: number
 *     installment: number
 *     other: number
 *     null: number
 *   }
 * }
 */
export const GET = withAuth(['manager', 'admin', 'finance'], async (request, { user, supabaseAdmin }) => {
  try {
    // Get visible rep IDs based on user's role
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);

    // Fetch all sales (with scope filtering)
    let query = supabaseAdmin.from('dialog_tv_sales').select('*');
    query = scopeSalesQuery(query, visibleRepIds);

    const { data: allSales, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch sales data' },
        { status: 500 }
      );
    }

    const sales = allSales || [];

    // Calculate aggregations
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);

    // Group by status
    const byStatus = {
      pending: sales.filter((s) => s.status === 'pending').length,
      approved: sales.filter((s) => s.status === 'approved').length,
      rejected: sales.filter((s) => s.status === 'rejected').length,
    };

    // Group by payment type
    const byPaymentType = {};
    sales.forEach((s) => {
      const type = s.payment_type || 'null';
      byPaymentType[type] = (byPaymentType[type] || 0) + 1;
    });

    return NextResponse.json(
      {
        stats: {
          total_sales: totalSales,
          total_revenue: totalRevenue,
          by_status: byStatus,
          by_payment_type: byPaymentType,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Fetch reports error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
