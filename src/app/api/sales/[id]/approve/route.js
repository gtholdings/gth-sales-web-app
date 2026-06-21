import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds } from '@/lib/scope-query';
import { NextResponse } from 'next/server';

/**
 * PATCH /api/sales/[id]/approve
 * Protected endpoint - approves or rejects a sale
 *
 * Headers: Authorization: Bearer {token}
 * Params: id (sale ID)
 *
 * Body: {
 *   status: string (required) - 'approved' or 'rejected'
 *   notes: string (optional) - approval/rejection notes
 * }
 *
 * Response: {
 *   id: string
 *   status: string (updated)
 *   ...
 * }
 */
export const PATCH = withAuth(['team_lead', 'manager', 'admin'], async (request, { user, supabaseAdmin }) => {
  try {
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('id');
    const body = await request.json();
    const { status: newStatus, notes } = body;

    // Validate sale ID
    if (!saleId) {
      return NextResponse.json(
        { error: 'Missing sale ID' },
        { status: 400 }
      );
    }

    // Validate status
    if (!newStatus || !['approved', 'rejected'].includes(newStatus)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    // Fetch the sale to check ownership/scope
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
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
      .from('sales')
      .update({
        status: newStatus,
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
    console.error('Approve sale error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
