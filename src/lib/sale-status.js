// ──────────────────────────────────────────────────────────────────────────
// Sale lifecycle status derivation.
//
// Stored sale_status enum: pending | confirmed | in_progress | closed | rejected
//   pending     — rep submitted; awaiting back-office/approval
//   confirmed   — approved + schedule generated; nothing bank-confirmed yet
//   in_progress — at least one payable confirmed (paid), but not all
//   closed      — every payable confirmed paid
//   rejected    — declined
//
// `confirmed`, `in_progress` and `closed` are all reachable once a schedule
// exists. We pick between them purely from how many installments are confirmed
// `paid`, so the displayed status always matches reality. `pending`/`rejected`
// are sticky (no schedule yet / terminal).
// ──────────────────────────────────────────────────────────────────────────

export const SALE_STATUSES = ['pending', 'confirmed', 'in_progress', 'closed', 'rejected'];

// Statuses that mean "a schedule exists and we collect against it".
export const ACTIVE_SALE_STATUSES = ['confirmed', 'in_progress', 'closed'];

/**
 * Derive the lifecycle status for a scheduled sale from its installments.
 * Only meaningful for sales whose base status is one of ACTIVE_SALE_STATUSES.
 * @param {Array<{status:string}>} installments
 * @returns {'confirmed'|'in_progress'|'closed'}
 */
export function deriveScheduledStatus(installments) {
  const rows = Array.isArray(installments) ? installments : [];
  if (rows.length === 0) return 'confirmed';
  const paid = rows.filter((i) => i.status === 'paid').length;
  if (paid === rows.length) return 'closed';
  if (paid >= 1) return 'in_progress';
  return 'confirmed';
}

/**
 * Effective status for display/reporting given the stored status + installments.
 * pending/rejected pass through unchanged; otherwise it's derived.
 */
export function effectiveSaleStatus(baseStatus, installments) {
  if (baseStatus === 'pending' || baseStatus === 'rejected') return baseStatus;
  return deriveScheduledStatus(installments);
}

/**
 * Recompute and persist a scheduled sale's status from its installments.
 * No-op for pending/rejected sales. Returns the new status (or null if unchanged
 * / not applicable). Call after a payment is confirmed or a claim is rejected.
 */
export async function recomputeSaleStatus(saleId, supabaseAdmin) {
  const { data: sale } = await supabaseAdmin
    .from('dialog_tv_sales').select('status').eq('id', saleId).single();
  if (!sale || sale.status === 'pending' || sale.status === 'rejected') return null;

  const { data: rows } = await supabaseAdmin
    .from('installments').select('status').eq('sale_id', saleId);

  const next = deriveScheduledStatus(rows);
  if (next === sale.status) return null;

  await supabaseAdmin
    .from('dialog_tv_sales')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', saleId);
  return next;
}
