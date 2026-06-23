/**
 * Server-side reader for the installment-plan configuration (admin-editable in
 * app_config). Falls back to sensible defaults if a key is missing.
 *
 *   installment_interest_percent — flat interest % per installment on the financed amount
 *   max_installments             — maximum number of installments a sale may have
 *
 * @param {*} supabaseAdmin
 * @returns {Promise<{interestPercent:number, maxInstallments:number}>}
 */
export async function readPlanConfig(supabaseAdmin) {
  const { data } = await supabaseAdmin
    .from('app_config')
    .select('key, value')
    .in('key', ['installment_interest_percent', 'max_installments']);
  const get = (k, fb) => {
    const n = Number(data?.find((c) => c.key === k)?.value);
    return Number.isFinite(n) ? n : fb;
  };
  return {
    interestPercent: get('installment_interest_percent', 10),
    maxInstallments: get('max_installments', 12),
  };
}
