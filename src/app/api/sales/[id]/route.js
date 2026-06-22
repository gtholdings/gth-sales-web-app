import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds } from '@/lib/scope-query';
import { installmentDisplayStatus } from '@/lib/installments';
import { appNow } from '@/lib/datetime';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * GET /api/sales/[id]
 * Full sale detail: the sale, its payable rows (base + installment schedule)
 * with display status + claimer/confirmer names, and the audit event timeline.
 * Gated to any in-scope user (rep on own sales, TL/manager within their tree,
 * admin/credit_officer globally).
 */
export const GET = withAuth(['any'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: saleId } = await params;

    const { data: sale, error } = await supabaseAdmin
      .from('dialog_tv_sales')
      .select(`
        *,
        rep:profiles!rep_id(id, full_name, email, phone),
        approver:profiles!approved_by(id, full_name),
        installments(*, claimer:profiles!claimed_by(full_name), confirmer:profiles!confirmed_by(full_name))
      `)
      .eq('id', saleId)
      .single();

    if (error || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Scope check.
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);
    if (visibleRepIds !== '*' && !visibleRepIds.includes(sale.rep_id)) {
      return NextResponse.json({ error: 'You do not have permission to view this sale' }, { status: 403 });
    }

    // Threshold for overdue -> defaulted overlay.
    const { data: cfg } = await supabaseAdmin
      .from('app_config').select('value').eq('key', 'default_days_threshold').single();
    const thresholdDays = Number(cfg?.value ?? 30);
    const today = appNow();

    const installments = (sale.installments || [])
      .sort((a, b) => a.installment_number - b.installment_number)
      .map((i) => ({
        ...i,
        display_status: installmentDisplayStatus(i, thresholdDays, today),
        claimed_by_name: i.claimer?.full_name || null,
        confirmed_by_name: i.confirmer?.full_name || null,
      }));

    // Audit timeline.
    const { data: events } = await supabaseAdmin
      .from('payment_events')
      .select('*, author:profiles!author_id(full_name)')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true });

    const timeline = (events || []).map((e) => ({
      id: e.id,
      installment_id: e.installment_id,
      event_type: e.event_type,
      note: e.note,
      amount: e.amount,
      created_at: e.created_at,
      author_name: e.author?.full_name || 'Unknown',
    }));

    const { installments: _omit, ...saleFields } = sale;
    return NextResponse.json({ sale: saleFields, installments, events: timeline }, { status: 200 });
  } catch (error) {
    logger.error('Sale detail error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
