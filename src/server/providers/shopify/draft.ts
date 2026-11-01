import "server-only";
import { StepError } from "@/server/pipeline/run-step";
import { isColorAttribute } from "@/lib/variants";
import { detailsHtml, toHtml } from "../html";
import type { ShopifyDraftInput } from "../types";

/**
 * Turns a listing into Shopify's productSet input, and nothing else: no calls, so it is
 * tested on its own. productSet replaces a product's variants and files with the lists
 * it is given, so on an update the seller's own variants and photos are sent back by id;
 * only ListSnap's own (marked by metafields) are ever changed or dropped.
 */

export const NS = "listsnap";
// Shopify's name for the one option of a product with no options
const TITLE_OPTION = { name: "Title", value: "Default Title" };
const COLOR = "Color";
// item_id of the one variant of a product with no colours
const LISTING_VARIANT = "listing";

/** The product as read back from Shopify before an update (queries.ts PRODUCT). */
export interface ExistingProduct {
  id: string;
  options: { name: string; optionValues: { name: string }[] }[];
  variants: { id: string; price: string; selectedOptions: { name: string; value: string }[]; itemId: string | null }[];
  /** Every media id on the product, in order. */
  media: string[];
  /** Which of those are ours, by our media id. */
  mediaMap: Record<string, string>;
}

export type FileSet = { id: string } | { originalSource: string; alt: string; filename: string; contentType: "IMAGE" };

export interface ProductSetPlan {
  input: Record<string, unknown>;
  /** The media id behind each file sent, in order; null for the seller's own. */
  sentMedia: (string | null)[];
}

export const listingSku = (listingId: string) => `listsnap-${listingId}`;
export const variantSku = (listingId: string, itemId: string) => `${listingSku(listingId)}-${itemId.slice(0, 8)}`;

/** Spark's text in Shopify's single description field: the short one first, then the details. */
export function descriptionHtml(input: ShopifyDraftInput, withColours: boolean): string {
  const details = input.attributes.filter((a) => !(withColours && isColorAttribute(a.name)));
  return [toHtml(input.shortDescription), toHtml(input.description), detailsHtml(details)].filter(Boolean).join("\n");
}

export function productSetInput(
  input: ShopifyDraftInput,
  existing: ExistingProduct | null,
  /** A signed link for each of our media ids that still exists. */
  src: Map<string, { url: string; ext: string }>,
): ProductSetPlan {
  const variants = input.variants?.length ? input.variants : null;

  const files: FileSet[] = [];
  const sentMedia: (string | null)[] = [];
  const fileFor = new Map<string, FileSet>();
  for (const img of input.images) {
    const id = existing?.mediaMap[img.mediaId];
    // a photo Shopify already has stays the same file, so an update never adds a copy
    const kept = id && existing?.media.includes(id) ? { id } : null;
    const s = src.get(img.mediaId);
    const file: FileSet | null =
      kept ??
      (s
        ? { originalSource: s.url, alt: img.alt, filename: `${NS}-${img.mediaId}.${s.ext}`, contentType: "IMAGE" }
        : null);
    if (!file || fileFor.has(img.mediaId)) continue;
    fileFor.set(img.mediaId, file);
    files.push(file);
    sentMedia.push(img.mediaId);
  }
  const ours = new Set(Object.values(existing?.mediaMap ?? {}));
  for (const id of existing?.media ?? [])
    if (!ours.has(id)) {
      files.push({ id });
      sentMedia.push(null);
    }

  const theirs = existing?.variants.filter((v) => !v.itemId) ?? [];
  const optionName = variants ? COLOR : TITLE_OPTION.name;
  // a seller who added Size in Shopify, or their own variants that don't fit the colours,
  // make a product shape ListSnap can't rebuild without undoing their work
  const foreign =
    existing?.options.some((o) => o.name !== COLOR && o.name !== TITLE_OPTION.name) ||
    theirs.some((v) => v.selectedOptions.some((o) => o.name !== optionName)) ||
    (!variants && theirs.length > 0);
  if (foreign) throw new StepError("shopifyOptions", { permanent: true });

  const stock = (qty: number | null) =>
    qty === null || !input.locationId
      ? { inventoryItem: { tracked: false } }
      : {
          inventoryItem: { tracked: true },
          inventoryQuantities: [{ locationId: input.locationId, name: "available", quantity: qty }],
        };
  const price = (p: number | null) => (p === null ? {} : { price: String(p) });
  const theirVariants = theirs.map((v) => ({
    id: v.id,
    price: v.price,
    optionValues: v.selectedOptions.map((o) => ({ optionName: o.name, name: o.value })),
  }));

  let productOptions: { name: string; values: { name: string }[] }[];
  let ourVariants: Record<string, unknown>[];
  if (variants) {
    const names = [
      ...new Set([...variants.map((v) => v.color), ...theirs.flatMap((v) => v.selectedOptions.map((o) => o.value))]),
    ];
    productOptions = [{ name: COLOR, values: names.map((name) => ({ name })) }];
    ourVariants = variants.map((v) => {
      const id = existing?.variants.find((e) => e.itemId === v.itemId)?.id;
      const file = v.mediaId ? fileFor.get(v.mediaId) : undefined;
      return {
        ...(id
          ? { id }
          : {
              sku: variantSku(input.listingId, v.itemId),
              metafields: [{ namespace: NS, key: "item_id", type: "single_line_text_field", value: v.itemId }],
            }),
        optionValues: [{ optionName: COLOR, name: v.color }],
        ...price(v.regularPrice),
        ...stock(v.stockQty),
        ...(file ? { file } : {}),
      };
    });
  } else {
    productOptions = [{ name: TITLE_OPTION.name, values: [{ name: TITLE_OPTION.value }] }];
    // a product with no options has exactly one variant, marked as the listing's own
    const id = existing?.variants.find((v) => v.itemId === LISTING_VARIANT)?.id;
    ourVariants = [
      {
        ...(id
          ? { id }
          : {
              sku: listingSku(input.listingId),
              metafields: [{ namespace: NS, key: "item_id", type: "single_line_text_field", value: LISTING_VARIANT }],
            }),
        optionValues: [{ optionName: TITLE_OPTION.name, name: TITLE_OPTION.value }],
        ...price(input.regularPrice),
        ...stock(input.stockQty),
      },
    ];
  }

  return {
    input: {
      title: input.title,
      descriptionHtml: descriptionHtml(input, !!variants),
      productType: input.category.trim(),
      tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 10),
      productOptions,
      variants: [...ourVariants, ...(variants ? theirVariants : [])],
      files,
      // only on create: metafields is a list productSet would replace, the seller's included,
      // and an update must leave a draft the seller published by hand published
      ...(existing
        ? {}
        : {
            status: "DRAFT",
            metafields: [{ namespace: NS, key: "listing_id", type: "single_line_text_field", value: input.listingId }],
          }),
    },
    sentMedia,
  };
}

/**
 * Which Shopify media is ours after a save. Shopify answers with the product's media in
 * the order the files were sent; if the counts differ (a file it refused), only the
 * photos sent by id are certain, and new ones are matched again on the next save.
 */
export function mediaMapAfter(plan: ProductSetPlan, files: FileSet[], saved: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  plan.sentMedia.forEach((mediaId, i) => {
    if (!mediaId) return;
    const sent = files[i]!;
    if ("id" in sent) map[mediaId] = sent.id;
    else if (saved.length === files.length && saved[i]) map[mediaId] = saved[i]!;
  });
  return map;
}

/** "gid://shopify/Product/123" → the admin's product page. */
export function editUrl(shop: string, productGid: string): string {
  const id = productGid.split("/").pop();
  return `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, "")}/products/${id}`;
}
