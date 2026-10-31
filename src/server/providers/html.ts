import "server-only";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain model text to store HTML: blank lines make paragraphs, single line breaks stay. */
export function toHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>\n")}</p>`)
    .join("\n");
}

/** Product details as a list, for stores with no per-product attributes of their own (Shopify). */
export function detailsHtml(details: { name: string; value: string }[]): string {
  if (!details.length) return "";
  const items = details.map((d) => `<li><strong>${escapeHtml(d.name)}:</strong> ${escapeHtml(d.value)}</li>`);
  return `<ul>\n${items.join("\n")}\n</ul>`;
}
