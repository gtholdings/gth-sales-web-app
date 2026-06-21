import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds } from '@/lib/scope-query';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * POST /api/sales/[id]/installments/[installmentId]/claim
 * Any in-scope user marks a payable as paid -> goes to Finance for confirmation.
 * Body: { paid_amount?: number, note?: string }
 */
export const POST = withAuth(['any'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: saleId, installmentId } = await params;
    const body = await request.json().catch(() => ({}));
    const { paid_amount, note } = body;

    // Scope: load sale, check visibility.
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from('dialog_tv_sales').select('id, rep_id').eq('id', saleId).single();
    if (saleErr || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);
    if (visibleRepIds !== '*' && !visibleRepIds.includes(sale.rep_id)) {
      return NextResponse.json({ error: 'You do not have permission for this sale' }, { status: 403 });
    }

    // Load the installment, ensure it belongs to this sale and is claimable.
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('installments').select('*').eq('id', installmentId).eq('sale_id', saleId).single();
    if (itemErr || !item) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }
    if (item.status === 'paid') {
      return NextResponse.json({ error: 'This payment is already confirmed' }, { status: 409 });
    }
    if (item.status === 'awaiting_confirmation') {
      return NextResponse.json({ error: 'This payment is already awaiting finance confirmation' }, { status: 409 });
    }

    const amount = paid_amount != null ? Number(paid_amount) : Number(item.amount);
    const nowIso = new Date().toISOString();

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('installments')
      .update({
        status: 'awaiting_confirmation',
        claimed_by: user.id,
        claimed_at: nowIso,
        paid_amount: amount,
        updated_at: nowIso,
      })
      .eq('id', installmentId)
      .select()
      .single();
    if (updErr) {
      logger.error('Claim: update failed', { installmentId, reason: updErr.message });
      return NextResponse.json({ error: 'Failed to record payment claim' }, { status: 500 });
    }

    await supabaseAdmin.from('payment_events').insert({
      sale_id: saleId, installment_id: installmentId, event_type: 'claim',
      author_id: user.id, amount, note: note || null,
    });

    logger.info('Payment claimed', { saleId, installmentId, by: user.id, amount });
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    logger.error('Claim error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
