import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds } from '@/lib/scope-query';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * POST /api/sales/[id]/approve
 * Protected endpoint - approves or rejects a sale
 *
 * Headers: Authorization: Bearer {token}
 * Params: id (sale ID, from the route path)
 *
 * Body: {
 *   action: string (required) - 'approve' or 'reject'
 *   notes: string (optional) - approval/rejection notes
 * }
 *
 * Response: {
 *   id: string
 *   status: string (updated)
 *   ...
 * }
 */
export const POST = withAuth(['team_lead', 'manager', 'admin'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: saleId } = await params;
    const body = await request.json();
    const { action, notes } = body;

    // Validate sale ID
    if (!saleId) {
      return NextResponse.json(
        { error: 'Missing sale ID' },
        { status: 400 }
      );
    }

    // Map action -> sale status
    const statusByAction = { approve: 'approved', reject: 'rejected' };
    const newStatus = statusByAction[action];
    if (!newStatus) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Fetch the sale to check ownership/scope
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('dialog_tv_sales')
      .select('*')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      );
    }

    // Verify user can approve this sale (rep_id must be in their visible IDs)
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);
    if (visibleRepIds !== '*' && !visibleRepIds.includes(sale.rep_id)) {
      return NextResponse.json(
        { error: 'You do not have permission to approve this sale' },
        { status: 403 }
      );
    }

    // Update sale status
    const { data: updatedSale, error: updateError } = await supabaseAdmin
      .from('dialog_tv_sales')
      .update({
        status: newStatus,
        ...(notes !== undefined ? { notes } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', saleId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update sale status' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedSale, { status: 200 });
  } catch (error) {
    logger.error('Approve sale error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
