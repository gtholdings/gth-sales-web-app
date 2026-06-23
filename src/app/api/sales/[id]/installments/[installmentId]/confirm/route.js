import { withAuth } from '@/lib/auth-middleware';
import { appTodayYMD } from '@/lib/datetime';
import { recomputeSaleStatus } from '@/lib/sale-status';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * POST /api/sales/[id]/installments/[installmentId]/confirm
 * Finance/admin confirms (or rejects) a claimed payment after checking the bank.
 * Body: { action: 'confirm' | 'reject', note?: string, paid_amount?: number }
 *
 * confirm -> status 'paid', records paid_date + confirmer; if every payable on
 *            the sale is paid, the sale is marked 'completed'.
 * reject  -> status back to 'pending', claim cleared, finance_note set.
 * Finance/admin act globally (no rep-scope restriction).
 */
export const POST = withAuth(['credit_officer', 'admin'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: saleId, installmentId } = await params;
    const body = await request.json().catch(() => ({}));
    const { action, note, paid_amount } = body;

    if (action !== 'confirm' && action !== 'reject') {
      return NextResponse.json({ error: 'Invalid action. Must be "confirm" or "reject"' }, { status: 400 });
    }
    const comment = typeof note === 'string' ? note.trim() : '';
    if (!comment) {
      return NextResponse.json({ error: 'A comment is required' }, { status: 400 });
    }

    const { data: item, error: itemErr } = await supabaseAdmin
      .from('installments').select('*').eq('id', installmentId).eq('sale_id', saleId).single();
    if (itemErr || !item) {
      return NextResponse.json({ error: 'Installment not found' }, { status: 404 });
    }
    if (item.status !== 'awaiting_confirmation') {
      return NextResponse.json({ error: 'This payment is not awaiting confirmation' }, { status: 409 });
    }

    const nowIso = new Date().toISOString();

    if (action === 'confirm') {
      const amount = paid_amount != null ? Number(paid_amount) : Number(item.paid_amount ?? item.amount);
      const { data: updated, error: updErr } = await supabaseAdmin
        .from('installments')
        .update({
          status: 'paid',
          paid_amount: amount,
          paid_date: appTodayYMD(),
          confirmed_by: user.id,
          confirmed_at: nowIso,
          finance_note: comment,
          updated_at: nowIso,
        })
        .eq('id', installmentId)
        .select()
        .single();
      if (updErr) {
        logger.error('Confirm: update failed', { installmentId, reason: updErr.message });
        return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
      }

      await supabaseAdmin.from('payment_events').insert({
        sale_id: saleId, installment_id: installmentId, event_type: 'confirm',
        author_id: user.id, amount, note: comment,
      });

      // Advance the sale lifecycle from payment state (confirmed -> in_progress -> closed).
      await recomputeSaleStatus(saleId, supabaseAdmin);

      logger.info('Payment confirmed', { saleId, installmentId, by: user.id, amount });
      return NextResponse.json(updated, { status: 200 });
    }

    // reject
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('installments')
      .update({
        status: 'pending',
        claimed_by: null,
        claimed_at: null,
        paid_amount: null,
        finance_note: comment,
        updated_at: nowIso,
      })
      .eq('id', installmentId)
      .select()
      .single();
    if (updErr) {
      logger.error('Reject claim: update failed', { installmentId, reason: updErr.message });
      return NextResponse.json({ error: 'Failed to reject payment' }, { status: 500 });
    }

    await supabaseAdmin.from('payment_events').insert({
      sale_id: saleId, installment_id: installmentId, event_type: 'reject',
      author_id: user.id, note: comment,
    });

    // A rejection may move the sale back (closed/in_progress -> in_progress/confirmed).
    await recomputeSaleStatus(saleId, supabaseAdmin);

    logger.info('Payment claim rejected', { saleId, installmentId, by: user.id });
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    logger.error('Confirm error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
