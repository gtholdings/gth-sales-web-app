import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds } from '@/lib/scope-query';
import { splitInstallmentAmounts, monthlyDueDates } from '@/lib/installments';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * POST /api/sales/[id]/approve
 * Approve (and configure the installment schedule) or reject a pending sale.
 * Gated to team_lead / manager / admin, scoped to their visible reps.
 *
 * Body (approve):
 *   { action: 'approve',
 *     number_of_installments: int (>=1, installment sales),
 *     base_amount: number (down payment already paid, 0..total),
 *     first_due_date: 'YYYY-MM-DD',
 *     notes?: string }
 * Body (reject): { action: 'reject', notes?: string }
 *
 * On approve, generates payable rows in `installments`:
 *   - row 0: is_base = true (the down payment)
 *   - rows 1..N: monthly schedule, cents-exact amounts
 * and writes an `approve_sale` / `reject_sale` audit event.
 */
export const POST = withAuth(['team_lead', 'manager', 'admin'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: saleId } = await params;
    const body = await request.json();
    const { action, notes, number_of_installments, base_amount, first_due_date } = body;

    if (!saleId) {
      return NextResponse.json({ error: 'Missing sale ID' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject"' }, { status: 400 });
    }

    // Fetch the sale + scope check.
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('dialog_tv_sales')
      .select('*')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);
    if (visibleRepIds !== '*' && !visibleRepIds.includes(sale.rep_id)) {
      return NextResponse.json({ error: 'You do not have permission to approve this sale' }, { status: 403 });
    }

    // Idempotency: only act on pending sales; never regenerate a schedule.
    if (sale.status !== 'pending') {
      return NextResponse.json(
        { error: `Sale is already ${sale.status}` },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const collectionDate = nowIso.slice(0, 10); // down payment collected today

    // ---- REJECT ----
    if (action === 'reject') {
      const { data: updated, error: updErr } = await supabaseAdmin
        .from('dialog_tv_sales')
        .update({ status: 'rejected', ...(notes !== undefined ? { notes } : {}), updated_at: nowIso })
        .eq('id', saleId)
        .select()
        .single();
      if (updErr) {
        logger.error('Reject sale: update failed', { saleId, reason: updErr.message });
        return NextResponse.json({ error: 'Failed to reject sale' }, { status: 500 });
      }
      await supabaseAdmin.from('payment_events').insert({
        sale_id: saleId, event_type: 'reject_sale', author_id: user.id, note: notes || null,
      });
      logger.info('Sale rejected', { saleId, by: user.id });
      return NextResponse.json(updated, { status: 200 });
    }

    // ---- APPROVE ----
    const total = Number(sale.total_amount);
    let installmentRows = [];
    let numInstallments = 1;
    let baseAmount = 0;
    let firstDue = null;
    let perInstallment = null;

    if (sale.payment_type === 'installment') {
      const n = parseInt(number_of_installments, 10);
      baseAmount = Number(base_amount);
      firstDue = first_due_date;

      if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json({ error: 'number_of_installments must be an integer >= 1' }, { status: 400 });
      }
      if (!(baseAmount >= 0) || baseAmount >= total) {
        return NextResponse.json({ error: 'base_amount must be between 0 and the total amount' }, { status: 400 });
      }
      if (!firstDue || Number.isNaN(Date.parse(firstDue))) {
        return NextResponse.json({ error: 'first_due_date (YYYY-MM-DD) is required' }, { status: 400 });
      }

      numInstallments = n;
      const remaining = Math.round((total - baseAmount) * 100) / 100;
      const amounts = splitInstallmentAmounts(remaining, n);
      const dueDates = monthlyDueDates(firstDue, n);
      perInstallment = amounts[0];

      // Base / down-payment (installment_number 0). The supervisor is collecting
      // it right now, so it starts as CLAIMED (awaiting finance confirmation),
      // dated to the collection day — not a future "pending" due date.
      installmentRows.push({
        sale_id: saleId, installment_number: 0, is_base: true,
        amount: baseAmount, due_date: collectionDate,
        status: 'awaiting_confirmation', claimed_by: user.id, claimed_at: nowIso, paid_amount: baseAmount,
      });
      // Scheduled installments 1..N (start pending).
      for (let i = 0; i < n; i++) {
        installmentRows.push({
          sale_id: saleId, installment_number: i + 1, is_base: false,
          amount: amounts[i], due_date: dueDates[i], status: 'pending',
        });
      }
    } else {
      // Full payment: a single base payable equal to the total, collected now.
      baseAmount = total;
      installmentRows.push({
        sale_id: saleId, installment_number: 0, is_base: true,
        amount: total, due_date: collectionDate,
        status: 'awaiting_confirmation', claimed_by: user.id, claimed_at: nowIso, paid_amount: total,
      });
    }

    // Persist installments (replace any stale rows from the old auto-trigger era).
    await supabaseAdmin.from('installments').delete().eq('sale_id', saleId);
    const { data: insertedRows, error: insErr } = await supabaseAdmin
      .from('installments').insert(installmentRows).select('id, is_base');
    if (insErr) {
      logger.error('Approve sale: installment insert failed', { saleId, reason: insErr.message });
      return NextResponse.json({ error: 'Failed to create installments' }, { status: 500 });
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('dialog_tv_sales')
      .update({
        status: 'approved',
        num_installments: numInstallments,
        base_amount: baseAmount,
        first_due_date: sale.payment_type === 'installment' ? firstDue : null,
        installment_amount: perInstallment,
        approved_by: user.id,
        approved_at: nowIso,
        ...(notes !== undefined ? { notes } : {}),
        updated_at: nowIso,
      })
      .eq('id', saleId)
      .select()
      .single();

    if (updErr) {
      logger.error('Approve sale: update failed', { saleId, reason: updErr.message });
      return NextResponse.json({ error: 'Failed to approve sale' }, { status: 500 });
    }

    const baseRow = (insertedRows || []).find((r) => r.is_base);
    await supabaseAdmin.from('payment_events').insert([
      { sale_id: saleId, event_type: 'approve_sale', author_id: user.id, note: notes || null, amount: baseAmount },
      ...(baseRow
        ? [{
            sale_id: saleId, installment_id: baseRow.id, event_type: 'claim', author_id: user.id,
            amount: baseAmount, note: 'Down payment collected at agreement signing',
          }]
        : []),
    ]);

    logger.info('Sale approved', { saleId, by: user.id, installments: installmentRows.length });
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    logger.error('Approve sale error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
