import { Resend } from 'resend';
import logger from '@/lib/logger';

/**
 * Channel-agnostic notification layer.
 *
 * Email is implemented now (Resend). SMS / WhatsApp are stubs — adding them
 * later means implementing the channel function and mapping recipient.phone;
 * notification_log.channel already records which channel was used, so logging
 * and idempotency are channel-aware for free.
 *
 * Customer notices are deferred (staff-only for now), but `notify` is generic
 * enough to target a customer recipient later.
 */

const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;
const FROM = process.env.NOTIFICATION_FROM_EMAIL || 'onboarding@resend.dev';

const channels = {
  email: async ({ recipient, subject, body }) => {
    if (!recipient.email) throw new Error('recipient has no email');
    if (!resend) throw new Error('RESEND_API_KEY not configured');
    const { data, error } = await resend.emails.send({
      from: FROM, to: recipient.email, subject, html: body,
    });
    if (error) throw new Error(error.message || 'Resend send failed');
    return data?.id || null;
  },
  // Stubs — implement and wire recipient.phone when SMS/WhatsApp is enabled.
  sms: async () => { logger.info('notify: sms channel not implemented'); return null; },
  whatsapp: async () => { logger.info('notify: whatsapp channel not implemented'); return null; },
};

/**
 * Send a notification on a channel and record it in notification_log.
 * @returns {{status:'sent'|'failed', error?:string}}
 */
export async function notify(supabaseAdmin, { channel = 'email', recipient, saleId = null, subject, body }) {
  let status = 'sent';
  let errMsg = null;
  try {
    const send = channels[channel];
    if (!send) throw new Error(`unknown channel: ${channel}`);
    await send({ recipient, subject, body });
  } catch (e) {
    status = 'failed';
    errMsg = e.message;
    logger.warn('notify failed', { channel, to: recipient?.email, reason: e.message });
  }
  await supabaseAdmin.from('notification_log').insert({
    recipient_id: recipient?.id ?? null,
    sale_id: saleId,
    channel,
    recipient_email: recipient?.email ?? null,
    subject,
    body,
    status,
  });
  return { status, error: errMsg };
}

/** Walk profiles.reports_to upward from a starting profile id, collecting the chain. */
async function chainUpward(supabaseAdmin, startId) {
  const out = [];
  const seen = new Set();
  let currentId = startId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const { data: p } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, reports_to, status')
      .eq('id', currentId)
      .single();
    if (!p) break;
    out.push(p);
    currentId = p.reports_to;
  }
  return out;
}

/** Active finance recipients: configured list, else all active finance users. */
export async function resolveFinanceRecipients(supabaseAdmin) {
  const { data: cfg } = await supabaseAdmin
    .from('app_config').select('value').eq('key', 'notification_recipients_finance').single();
  const ids = Array.isArray(cfg?.value) ? cfg.value : [];
  const q = supabaseAdmin.from('profiles').select('id, full_name, email, role, status').eq('status', 'active');
  const { data } = ids.length ? await q.in('id', ids) : await q.eq('role', 'credit_officer');
  return data || [];
}

/**
 * Staff recipients for a sale: the rep + their supervisor + manager (via the
 * reports_to chain) + the finance team. Deduped, active, with an email.
 */
export async function resolveSaleStaffRecipients(supabaseAdmin, repId) {
  const chain = await chainUpward(supabaseAdmin, repId);
  const finance = await resolveFinanceRecipients(supabaseAdmin);
  const byId = new Map();
  for (const p of [...chain, ...finance]) {
    if (p && p.status === 'active' && p.email) byId.set(p.id, p);
  }
  return [...byId.values()];
}
