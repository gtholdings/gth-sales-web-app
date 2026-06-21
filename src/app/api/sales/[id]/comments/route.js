import { withAuth } from '@/lib/auth-middleware';
import { getVisibleRepIds } from '@/lib/scope-query';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * POST /api/sales/[id]/comments
 * Add a comment to a sale (or a specific installment) — an audit event with
 * author + timestamp. Any in-scope user.
 * Body: { note: string (required), installment_id?: string }
 */
export const POST = withAuth(['any'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: saleId } = await params;
    const body = await request.json().catch(() => ({}));
    const { note, installment_id } = body;

    if (!note || !String(note).trim()) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
    }

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from('dialog_tv_sales').select('id, rep_id').eq('id', saleId).single();
    if (saleErr || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }
    const visibleRepIds = await getVisibleRepIds(user, supabaseAdmin);
    if (visibleRepIds !== '*' && !visibleRepIds.includes(sale.rep_id)) {
      return NextResponse.json({ error: 'You do not have permission for this sale' }, { status: 403 });
    }

    // If an installment is referenced, make sure it belongs to this sale.
    if (installment_id) {
      const { data: item } = await supabaseAdmin
        .from('installments').select('id').eq('id', installment_id).eq('sale_id', saleId).single();
      if (!item) {
        return NextResponse.json({ error: 'Installment not found for this sale' }, { status: 404 });
      }
    }

    const { data: event, error: insErr } = await supabaseAdmin
      .from('payment_events')
      .insert({
        sale_id: saleId,
        installment_id: installment_id || null,
        event_type: 'comment',
        author_id: user.id,
        note: String(note).trim(),
      })
      .select('*, author:profiles!author_id(full_name)')
      .single();
    if (insErr) {
      logger.error('Comment: insert failed', { saleId, reason: insErr.message });
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }

    return NextResponse.json({
      id: event.id,
      installment_id: event.installment_id,
      event_type: event.event_type,
      note: event.note,
      created_at: event.created_at,
      author_name: event.author?.full_name || user.full_name,
    }, { status: 201 });
  } catch (error) {
    logger.error('Comment error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
