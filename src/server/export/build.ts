import "server-only";
import sharp from "sharp";
import { forWorkspace, type ListingRow } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { readMedia } from "@/server/media/store";
import { signedMediaUrl } from "@/server/media/signed";
import { StepError } from "@/server/pipeline/run-step";
import { listingProduct, type ListingProduct } from "@/server/stores/listing-product";
import { BanglaText } from "@/lib/schemas/pipeline";
import { catalogCsv, shopifyCsv, wooCsv, type CsvShop } from "./formats";
import { text } from "@/server/step-text";
import type { Locale } from "@/i18n/request";
import { fileSlug, marketplaceText, type KitLabels } from "./text";
import type { ZipEntry } from "./zip";

/**
 * Builds the export files from a shop's listings. Exporting makes no AI calls and changes
 * nothing, so it isn't metered and can be repeated freely.
 */

export { EXPORT_MAX } from "@/lib/export";
export const CSV_FORMATS = ["facebook", "woocommerce", "shopify"] as const;
export type CsvFormat = (typeof CSV_FORMATS)[number];

const EXPORTABLE = new Set<ListingRow["status"]>(["ready", "needs_review", "in_store", "posted"]);
// the stores download the photos during the import, and Meta again later on
const LINK_TTL_S = 30 * 24 * 3600;
const PHOTO_MAX_SIDE = 2048;

export interface ExportListing {
  product: ListingProduct;
  bn: BanglaText | null;
}

/**
 * The finished listings among the ids, in the order given. Another shop's id finds
 * nothing, the same as one that doesn't exist; unfinished ones are left out.
 */
export async function loadExport(
  workspace: Workspace,
  ids: string[],
): Promise<{ ok: true; listings: ExportListing[] } | { ok: false; error: "not_found" | "not_ready" }> {
  const ws = forWorkspace(workspace.id);
  const rows = (await Promise.all(ids.map((id) => ws.getListing(id)))).filter((r): r is ListingRow => !!r);
  if (!rows.length) return { ok: false, error: "not_found" };
  const listings: ExportListing[] = [];
  for (const row of rows) {
    if (!EXPORTABLE.has(row.status)) continue;
    try {
      const product = await listingProduct(ws, workspace, row);
      listings.push({ product, bn: BanglaText.safeParse(row.fields_json?.bn).data ?? null });
    } catch (err) {
      if (!(err instanceof StepError)) throw err;
    }
  }
  return listings.length ? { ok: true, listings } : { ok: false, error: "not_ready" };
}

/** What a store or Meta needs to know about the shop, with photo links that last a month. */
export async function csvShop(workspace: Workspace, listings: ExportListing[]): Promise<CsvShop> {
  const ws = forWorkspace(workspace.id);
  const types = await ws.mediaTypes([...new Set(listings.flatMap((l) => l.product.images.map((i) => i.mediaId)))]);
  return {
    name: workspace.name,
    website: workspace.settings.website ?? "",
    imageUrl: (id) => {
      const mime = types.get(id);
      return mime ? signedMediaUrl(workspace.id, id, mime, LINK_TTL_S) : null;
    },
  };
}

export function exportCsv(format: CsvFormat, listings: ExportListing[], shop: CsvShop): string {
  const products = listings.map((l) => l.product);
  if (format === "facebook") return catalogCsv(products, shop);
  if (format === "woocommerce") return wooCsv(products, shop);
  return shopifyCsv(products, shop);
}

/** File names for the CSVs, inside a bulk zip and when downloaded on their own. */
export const CSV_NAMES: Record<CsvFormat, string> = {
  facebook: "catalog-facebook.csv",
  woocommerce: "products-woocommerce.csv",
  shopify: "products-shopify.csv",
};

export const kitName = (l: ExportListing) => fileSlug(l.product.title, l.product.listingId);

/** One listing's kit: its photos as JPEGs, main image first, and the text in each language it has. */
export async function* kitEntries(
  workspaceId: string,
  l: ExportListing,
  labels: { en: KitLabels; bn: KitLabels },
  folder = "",
): AsyncGenerator<ZipEntry> {
  const p = l.product;
  const extra = { price: p.regularPrice, category: p.category, colours: p.variants?.map((v) => v.color) ?? [] };
  yield {
    name: `${folder}listing-en.txt`,
    data: Buffer.from(marketplaceText(p, extra, labels.en)),
  };
  if (l.bn)
    yield {
      name: `${folder}listing-bn.txt`,
      data: Buffer.from(marketplaceText({ ...l.bn, shortDescription: l.bn.short_description }, extra, labels.bn)),
    };
  let n = 0;
  for (const img of p.images) {
    const data = await photoJpeg(workspaceId, img.mediaId);
    if (!data) continue;
    n++;
    yield { name: `${folder}photos/${String(n).padStart(2, "0")}${n === 1 ? "-main" : ""}.jpg`, data };
  }
}

/**
 * A photo as Marketplace and the catalogs take it: a JPEG no larger than 2048 px, a
 * transparent cutout flattened onto white, with no metadata.
 */
async function photoJpeg(workspaceId: string, mediaId: string): Promise<Buffer | null> {
  const file = await readMedia(workspaceId, mediaId);
  if (!file?.mime.startsWith("image/")) return null;
  try {
    return await sharp(file.data)
      .flatten({ background: "#ffffff" })
      .resize({ width: PHOTO_MAX_SIDE, height: PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/** The kit's text-file labels in each language, whatever language the page is in. */
export function kitLabels(): { en: KitLabels; bn: KitLabels } {
  const pick = (locale: Locale): KitLabels => {
    const t = (key: keyof KitLabels) => text(locale, `export.text.${key}`);
    return {
      title: t("title"),
      price: t("price"),
      category: t("category"),
      condition: t("condition"),
      conditionNew: t("conditionNew"),
      description: t("description"),
      colours: t("colours"),
      tags: t("tags"),
      note: t("note"),
    };
  };
  return { en: pick("en"), bn: pick("bn") };
}

/** Which file goes where, in the seller's language, with CRLF so Notepad shows the lines. */
export function readMe(locale: Locale, withCatalog: boolean): string {
  const t = (key: string) => text(locale, `export.readme.${key}`);
  const parts = [
    t("title"),
    t("kits"),
    withCatalog ? t("facebook") : t("facebookMissing"),
    t("woocommerce"),
    t("shopify"),
    t("links"),
  ];
  return `\uFEFF${parts.join("\r\n\r\n")}\r\n`;
}
