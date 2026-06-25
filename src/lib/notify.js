import nodemailer from 'nodemailer';
import { decryptSecret } from '@/lib/crypto';
import logger from '@/lib/logger';

/**
 * Channel-agnostic notification layer.
 *
 * Email is sent via Gmail's free SMTP (smtp.gmail.com) using nodemailer. The
 * sending account (Gmail address + App Password) is admin-configurable in
 * Settings (app_config keys smtp_user / smtp_app_password / smtp_from_name),
 * falling back to env GMAIL_USER / GMAIL_APP_PASSWORD. Gmail requires 2-Step
 * Verification on the account + a generated 16-char App Password (a normal
 * password is rejected). SMS / WhatsApp remain stubs.
 *
 * Customer notices are deferred (staff-only for now), but `notify` is generic
 * enough to target a customer recipient later.
 */

// Read the Gmail SMTP settings from app_config (admin Settings), env as fallback.
async function readMailConfig(supabaseAdmin) {
  let cfg = {};
  try {
    const { data } = await supabaseAdmin
      .from('app_config').select('key, value')
      .in('key', ['smtp_user', 'smtp_app_password', 'smtp_from_name']);
    for (const r of data || []) cfg[r.key] = r.value;
  } catch { /* fall back to env */ }
  const user = String(cfg.smtp_user || process.env.GMAIL_USER || '').trim();
  // Stored encrypted at rest — decrypt for use (plaintext/legacy passes through).
  const pass = String(decryptSecret(cfg.smtp_app_password) || process.env.GMAIL_APP_PASSWORD || '');
  const fromName = String(cfg.smtp_from_name || 'GT Sales').trim() || 'GT Sales';
  return { user, pass, fromName };
}

// Reuse a transporter across sends with the same credentials (pooled SMTP).
let _cached = null;
function getTransporter({ user, pass }) {
  const sig = `${user}::${pass.length}`;
  if (_cached?.sig === sig) return _cached.transporter;
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true, pool: true,
    auth: { user, pass },
  });
  _cached = { sig, transporter };
  return transporter;
}

const channels = {
  email: async ({ supabaseAdmin, recipient, subject, body }) => {
    if (!recipient.email) throw new Error('recipient has no email');
    const { user, pass, fromName } = await readMailConfig(supabaseAdmin);
    if (!user || !pass) {
      throw new Error('Gmail SMTP not configured — set the sender account + App Password in Settings');
    }
    const transporter = getTransporter({ user, pass });
    // Gmail rewrites From to the authenticated account, so we send as `user`.
    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`, to: recipient.email, subject, html: body,
    });
    return info?.messageId || null;
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
    await send({ supabaseAdmin, recipient, subject, body });
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
