import "server-only";
import { marketplaceFields } from "@/lib/marketplace";

/**
 * The listing kit's text files: plain UTF-8 laid out in the order of Facebook Marketplace's
 * "Create listing" form, so the seller copies one block at a time into the matching field.
 * Pure functions; the labels come from the message files, in the file's language.
 */

export interface KitLabels {
  title: string;
  price: string;
  category: string;
  condition: string;
  conditionNew: string;
  description: string;
  colours: string;
  tags: string;
  /** Meta's rule that Marketplace is for personal items, at the end of the file. */
  note: string;
}

export interface KitText {
  title: string;
  shortDescription: string;
  description: string;
  attributes: { name: string; value: string }[];
  tags: string[];
}

const SLUG_MAX = 40;

/**
 * A short ASCII name for files and handles. A long title is cut after its last whole word
 * that fits, so a seller never sees "with-b". A title with no Latin letters (a Bangla-only
 * one) falls back to "listing", and every name ends in the listing's short id so two
 * listings with the same title never clash.
 */
export function fileSlug(title: string, listingId: string): string {
  let slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > SLUG_MAX) {
    // one character more, so a word that ends exactly at the limit is kept
    const head = slug.slice(0, SLUG_MAX + 1);
    const cut = head.lastIndexOf("-");
    slug = cut > 0 ? head.slice(0, cut) : slug.slice(0, SLUG_MAX);
  }
  return `${slug || "listing"}-${listingId.slice(0, 8)}`;
}

export function marketplaceText(
  text: KitText,
  extra: { price: number | null; category: string; colours: string[] },
  l: KitLabels,
): string {
  const f = marketplaceFields(text, { ...extra, coloursLabel: l.colours });
  const blocks: [string, string][] = [
    [l.title, f.title],
    [l.price, f.price],
    [l.category, f.category],
    [l.condition, l.conditionNew],
    [l.description, f.description],
    [l.tags, f.tags],
  ];
  const body = blocks
    .filter(([, value]) => value)
    .map(([label, value]) => `${label.toUpperCase()}\n${value}`)
    .join("\n\n");
  // a BOM and CRLF so Notepad and phone viewers show Bangla and the line breaks
  return `\uFEFF${body}\n\n---\n${l.note}\n`.replace(/\r?\n/g, "\r\n");
}
