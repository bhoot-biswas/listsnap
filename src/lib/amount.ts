const BN_ZERO = "০".charCodeAt(0);

/**
 * A whole number typed by a seller: "১,২৫০", "৳1,250" and "1250" all mean 1250. A Bangla
 * keyboard types ০–৯, which `\d` doesn't match, so they are turned into 0–9 first; text with
 * no digits at all is null, never 0, so a slip can't save a free product.
 */
export function parseAmount(text: string): number | null {
  const latin = text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BN_ZERO));
  const kept = latin.replace(/[^\d.]/g, "");
  if (!/\d/.test(kept)) return null;
  const n = Number(kept);
  return Number.isFinite(n) ? Math.round(n) : null;
}
