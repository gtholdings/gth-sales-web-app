/**
 * Money is always shown in Sri Lankan Rupees as "Rs. 1,234.56" (never localized
 * to a currency symbol, never translated). Single source of truth — use this
 * everywhere instead of Intl currency formatting.
 */
export function formatRs(n) {
  const num = Number(n || 0);
  return `Rs. ${num.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
