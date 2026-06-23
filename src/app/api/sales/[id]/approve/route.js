import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds } from '@/lib/scope-query';
import { splitInstallmentAmounts, installmentDueDates } from '@/lib/installments';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * POST /api/sales/[id]/approve
 * Approve (and configure the installment schedule) or reject a pending sale.
 * Gated to supervisor / manager / admin, scoped to their visible reps.
 *
 * Body (approve):
 *   { action: 'approve',
 *     number_of_installments: int (>=1, installment sales),
 *     base_amount: number (down payment collected, 0..total),
 *     down_payment_date: 'YYYY-MM-DD' (installation date; installments run monthly from it),
 *     notes?: string }
 * Any change vs the rep's proposed_* values is logged as an `amend` event.
 * Body (reject): { action: 'reject', notes?: string }
 *
 * On approve, generates payable rows in `installments`:
 *   - row 0: is_base = true (the down payment)
 *   - rows 1..N: monthly schedule, cents-exact amounts
 * and writes an `approve_sale` / `reject_sale` audit event.
 */
export const POST = withAuth(['supervisor', 'manager', 'admin'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: saleId } = await params;
    const body = await request.json();
    const { action, notes, number_of_installments, base_amount, down_payment_date } = body;

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

    // ---- APPROVE (supervisor collects down payment + activates) ----
    const total = Number(sale.total_amount);
    let installmentRows = [];
    let numInstallments = 1;
    let baseAmount = total;
    let downPaymentDate = collectionDate;
    let perInstallment = null;

    if (sale.payment_type === 'installment') {
      const n = parseInt(number_of_installments, 10);
      baseAmount = Number(base_amount);
      downPaymentDate = down_payment_date;

      if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json({ error: 'number_of_installments must be an integer >= 1' }, { status: 400 });
      }
      if (!(baseAmount >= 0) || baseAmount >= total) {
        return NextResponse.json({ error: 'base_amount must be between 0 and the total amount' }, { status: 400 });
      }
      if (!downPaymentDate || Number.isNaN(Date.parse(downPaymentDate))) {
        return NextResponse.json({ error: 'down_payment_date (YYYY-MM-DD) is required' }, { status: 400 });
      }

      numInstallments = n;
      const remaining = Math.round((total - baseAmount) * 100) / 100;
      const amounts = splitInstallmentAmounts(remaining, n);
      const dueDates = installmentDueDates(downPaymentDate, n); // k=1..N months after the down payment
      perInstallment = amounts[0];

      // Down payment (installment_number 0) — collected now by the supervisor,
      // dated to the down-payment / installation date, starts CLAIMED (awaiting finance).
      installmentRows.push({
        sale_id: saleId, installment_number: 0, is_base: true,
        amount: baseAmount, due_date: downPaymentDate,
        status: 'awaiting_confirmation', claimed_by: user.id, claimed_at: nowIso, paid_amount: baseAmount,
      });
      for (let i = 0; i < n; i++) {
        installmentRows.push({
          sale_id: saleId, installment_number: i + 1, is_base: false,
          amount: amounts[i], due_date: dueDates[i], status: 'pending',
        });
      }
    } else {
      // Full payment: a single base payable equal to the total, collected now.
      installmentRows.push({
        sale_id: saleId, installment_number: 0, is_base: true,
        amount: total, due_date: downPaymentDate,
        status: 'awaiting_confirmation', claimed_by: user.id, claimed_at: nowIso, paid_amount: total,
      });
    }

    // Amendment audit: did the supervisor change the rep's proposed plan?
    const changes = [];
    if (sale.payment_type === 'installment') {
      if (sale.proposed_num_installments != null && numInstallments !== sale.proposed_num_installments) {
        changes.push(`installments ${sale.proposed_num_installments} → ${numInstallments}`);
      }
      if (sale.proposed_base_amount != null && Number(baseAmount) !== Number(sale.proposed_base_amount)) {
        changes.push(`down payment ${sale.proposed_base_amount} → ${baseAmount}`);
      }
      if (sale.proposed_down_payment_date && downPaymentDate !== sale.proposed_down_payment_date) {
        changes.push(`down payment date ${sale.proposed_down_payment_date} → ${downPaymentDate}`);
      }
    }

    // Persist installments (replace any stale rows).
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
        down_payment_date: sale.payment_type === 'installment' ? downPaymentDate : null,
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
      // Approval is a lifecycle action, not a payment — no amount (the down-payment
      // amount is recorded on the `claim` event below).
      { sale_id: saleId, event_type: 'approve_sale', author_id: user.id, note: notes || null },
      ...(changes.length
        ? [{
            sale_id: saleId, event_type: 'amend', author_id: user.id,
            note: `Amended rep's proposal: ${changes.join('; ')}`,
          }]
        : []),
      ...(baseRow
        ? [{
            sale_id: saleId, installment_id: baseRow.id, event_type: 'claim', author_id: user.id,
            amount: baseAmount, note: 'Down payment collected at agreement signing',
          }]
        : []),
    ]);

    logger.info('Sale approved', { saleId, by: user.id, installments: installmentRows.length, amended: changes.length > 0 });
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    logger.error('Approve sale error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
