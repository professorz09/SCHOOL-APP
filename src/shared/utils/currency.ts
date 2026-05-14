/**
 * INR formatters — single source for ₹ display.
 *
 * Two variants because the dashboard mixes two styles:
 *  - exact ledger lines ("Total Paid · ₹1,23,456") → fmtINR
 *  - compact tiles + charts ("Revenue · ₹1.2Cr")  → fmtINRCompact
 *
 * Both round to whole rupees — money is stored as INT in this app, so
 * paise never appear on screen.
 */

/** Plain "₹1,23,456" — Indian thousands grouping, no decimals. */
export function fmtINR(n: number): string {
  if (!Number.isFinite(n)) return '₹0';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * Compact Indian-currency notation: ₹1.5L, ₹2.3Cr, ₹4.5k. Trailing .0 is
 * dropped so round numbers read "₹1Cr" not "₹1.0Cr". Falls back to
 * grouped digits below ₹1,000.
 */
export function fmtINRCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(abs % 10_000_000 === 0 ? 0 : 1)}Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(abs % 100_000 === 0 ? 0 : 1)}L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}
