import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { addDays, subDays, parseISO, format } from 'date-fns';
import { supabaseAdmin } from '@/lib/supabase';
import { appTodayYMD, zonedDayStart } from '@/lib/datetime';
import { notify, resolveSaleStaffRecipients } from '@/lib/notify';
import { formatRs } from '@/lib/format';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Secured daily job (triggered by external cron, e.g. GitHub Actions):
 *   1. Mark pending installments past due -> overdue.
 *   2. Mark overdue installments older than threshold -> defaulted.
 *   3. Email staff 7 days before a due date (reminder).
 *   4. Email staff 1 day after a missed due date (overdue notice).
 * Idempotent: skips a send if an identical notification_log row exists today.
 *
 * Auth: header `x-cron-secret` must equal env CRON_SECRET (timing-safe).
 */
function authorized(request) {
  const provided = request.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getConfigNumber(key, fallback) {
  const { data } = await supabaseAdmin.from('app_config').select('value').eq('key', key).single();
  const n = Number(data?.value);
  return Number.isFinite(n) ? n : fallback;
}

// Send to all staff recipients for a sale, skipping same-day duplicates.
async function sendForInstallments(items, salesById, subjectFor, bodyFor) {
  const todayStartIso = zonedDayStart(appTodayYMD()).toISOString();
  let sent = 0, skipped = 0, failed = 0;
  for (const it of items) {
    const sale = salesById.get(it.sale_id);
    if (!sale) continue;
    const recipients = await resolveSaleStaffRecipients(supabaseAdmin, sale.rep_id);
    const subject = subjectFor(it, sale);
    const body = bodyFor(it, sale);
    for (const r of recipients) {
      // Idempotency: same recipient + sale + subject already logged today?
      const { data: dupes } = await supabaseAdmin
        .from('notification_log')
        .select('id')
        .eq('recipient_email', r.email)
        .eq('sale_id', sale.id)
        .eq('subject', subject)
        .eq('status', 'sent')
        .gte('sent_at', todayStartIso)
        .limit(1);
      if (dupes && dupes.length) { skipped++; continue; }

      const res = await notify(supabaseAdmin, { channel: 'email', recipient: r, saleId: sale.id, subject, body });
      if (res.status === 'sent') sent++; else failed++;
    }
  }
  return { sent, skipped, failed };
}

async function loadSales(saleIds) {
  const map = new Map();
  if (!saleIds.length) return map;
  // chunk to stay under URL limits
  for (let i = 0; i < saleIds.length; i += 300) {
    const chunk = saleIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from('dialog_tv_sales').select('id, rep_id, customer_name, total_amount').in('id', chunk);
    for (const s of data || []) map.set(s.id, s);
  }
  return map;
}

const money = (n) => formatRs(n);
const label = (it) => (it.is_base ? 'Down payment' : `Installment ${it.installment_number}`);

async function run() {
  const today = appTodayYMD();
  const threshold = await getConfigNumber('default_days_threshold', 30);
  const remindBefore = await getConfigNumber('reminder_days_before', 7);
  const overdueAfter = await getConfigNumber('overdue_days_after', 1);

  const reminderDate = format(addDays(parseISO(today), remindBefore), 'yyyy-MM-dd');
  const overdueNoticeDate = format(subDays(parseISO(today), overdueAfter), 'yyyy-MM-dd');
  const defaultedBefore = format(subDays(parseISO(today), threshold), 'yyyy-MM-dd');

  // 1. pending past due -> overdue
  const { data: markedOverdue } = await supabaseAdmin
    .from('installments').update({ status: 'overdue', updated_at: new Date().toISOString() })
    .eq('status', 'pending').lt('due_date', today).select('id');

  // 2. overdue older than threshold -> defaulted
  const { data: markedDefaulted } = await supabaseAdmin
    .from('installments').update({ status: 'defaulted', updated_at: new Date().toISOString() })
    .eq('status', 'overdue').lt('due_date', defaultedBefore).select('id');

  // 3. reminders: due in `remindBefore` days, still pending
  const { data: upcoming } = await supabaseAdmin
    .from('installments').select('id, sale_id, amount, due_date, installment_number, is_base')
    .eq('status', 'pending').eq('due_date', reminderDate);

  // 4. overdue notices: missed by `overdueAfter` days
  const { data: overdue } = await supabaseAdmin
    .from('installments').select('id, sale_id, amount, due_date, installment_number, is_base')
    .eq('status', 'overdue').eq('due_date', overdueNoticeDate);

  const sales = await loadSales([
    ...new Set([...(upcoming || []), ...(overdue || [])].map((i) => i.sale_id)),
  ]);

  const reminders = await sendForInstallments(
    upcoming || [], sales,
    (it, s) => `Upcoming payment due ${it.due_date} — ${s.customer_name}`,
    (it, s) => `<p>${label(it)} of <strong>${money(it.amount)}</strong> for <strong>${s.customer_name}</strong> is due on <strong>${it.due_date}</strong>.</p>`,
  );
  const notices = await sendForInstallments(
    overdue || [], sales,
    (it, s) => `OVERDUE payment (due ${it.due_date}) — ${s.customer_name}`,
    (it, s) => `<p>${label(it)} of <strong>${money(it.amount)}</strong> for <strong>${s.customer_name}</strong> was due on <strong>${it.due_date}</strong> and is unpaid.</p>`,
  );

  const summary = {
    marked_overdue: markedOverdue?.length || 0,
    marked_defaulted: markedDefaulted?.length || 0,
    reminders_sent: reminders.sent, reminders_skipped: reminders.skipped, reminders_failed: reminders.failed,
    overdue_sent: notices.sent, overdue_skipped: notices.skipped, overdue_failed: notices.failed,
  };
  logger.info('Cron installment-reminders complete', summary);
  return summary;
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await run(), { status: 200 });
  } catch (error) {
    logger.error('Cron installment-reminders failed', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Allow GET too (some cron services only do GET), same auth.
export async function GET(request) {
  return POST(request);
}
