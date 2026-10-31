import "server-only";
import { StepError } from "@/server/pipeline/run-step";
import type { WooVariantInput } from "../types";
import type { WooApi } from "./http";

/**
 * Colour variations of a variable product. The store's own Color attribute is used when
 * it has one, so the colours show up in its filters and swatches; otherwise the product
 * gets a Color attribute of its own. Each variation carries its item id, so a later save
 * updates the same variation, and only variations ListSnap made are ever removed.
 */

export const ITEM_META_KEY = "_listsnap_item_id";

const BATCH_TIMEOUT_MS = 60_000;

interface Attribute {
  id: number;
  name: string;
}

interface Term {
  id: number;
  name: string;
}

interface Variation {
  id: number;
  meta_data: { key: string; value: unknown }[];
}

interface BatchItem {
  id: number;
  error?: { code: string; message: string };
}

export interface ColorAttribute {
  /** The product-level attribute, listing every colour. */
  product: Record<string, unknown>;
  /** How one variation names its colour. */
  option(color: string): Record<string, unknown>;
}

export async function colorAttribute(api: WooApi, colors: string[]): Promise<ColorAttribute> {
  const all = await api.get<Attribute[]>("products/attributes");
  const global = all.find((a) => /^colou?r$/i.test(a.name.trim()));
  if (!global) {
    return {
      product: { name: "Color", options: colors, visible: true, variation: true },
      option: (color) => ({ name: "Color", option: color }),
    };
  }
  // a global attribute only takes its own terms, so missing colours are added to it
  const names = new Map<string, string>();
  for (const color of colors) names.set(color.toLowerCase(), await colorTerm(api, global.id, color));
  return {
    product: { id: global.id, options: [...names.values()], visible: true, variation: true },
    option: (color) => ({ id: global.id, option: names.get(color.toLowerCase()) ?? color }),
  };
}

async function colorTerm(api: WooApi, attributeId: number, color: string): Promise<string> {
  const path = `products/attributes/${attributeId}/terms`;
  const found = await api.get<Term[]>(path, { search: color, per_page: 100 });
  const match = found.find((t) => t.name.trim().toLowerCase() === color.toLowerCase());
  return match ? match.name : (await api.post<Term>(path, { name: color })).name;
}

/**
 * Creates, updates and removes variations in one batch so the product never shows
 * half the colours. `images.ids` maps a colour's media to a store image the product
 * already has. A new variation without one is given its photo from `images.src` (a
 * signed link the store downloads); an existing one keeps the image it has, so saving
 * again never uploads a photo twice.
 */
export async function syncVariations(
  api: WooApi,
  productId: number,
  variants: WooVariantInput[],
  attribute: ColorAttribute,
  images: { ids: Map<string, number>; src(mediaId: string): Promise<string | null> },
): Promise<void> {
  const existing = await api.get<Variation[]>(`products/${productId}/variations`, { per_page: 100 });
  const ours = new Map<string, number>();
  for (const v of existing) {
    const item = v.meta_data.find((m) => m.key === ITEM_META_KEY)?.value;
    if (typeof item === "string") ours.set(item, v.id);
  }
  const body = async (v: WooVariantInput, isNew: boolean) => {
    const id = v.mediaId ? images.ids.get(v.mediaId) : undefined;
    const src = !id && isNew && v.mediaId ? await images.src(v.mediaId) : null;
    return {
      regular_price: v.regularPrice === null ? "" : String(v.regularPrice),
      manage_stock: v.stockQty !== null,
      ...(v.stockQty === null ? {} : { stock_quantity: v.stockQty }),
      attributes: [attribute.option(v.color)],
      meta_data: [{ key: ITEM_META_KEY, value: v.itemId }],
      ...(id ? { image: { id } } : src ? { image: { src, alt: v.color } } : {}),
    };
  };
  const toCreate = variants.filter((v) => !ours.has(v.itemId));
  const toUpdate = variants.filter((v) => ours.has(v.itemId));
  const create = await Promise.all(toCreate.map((v) => body(v, true)));
  const update = await Promise.all(toUpdate.map(async (v) => ({ id: ours.get(v.itemId), ...(await body(v, false)) })));
  const keep = new Set(variants.map((v) => v.itemId));
  const result = await api.post<{ create?: BatchItem[]; update?: BatchItem[] }>(
    `products/${productId}/variations/batch`,
    {
      create,
      update,
      delete: [...ours].filter(([item]) => !keep.has(item)).map(([, id]) => id),
    },
    { timeoutMs: BATCH_TIMEOUT_MS },
  );
  const sent = [...toCreate, ...toUpdate];
  const answers = [...(result.create ?? []), ...(result.update ?? [])];
  const failed = answers.findIndex((a) => a.error);
  if (failed < 0) return;
  const name = sent[failed]?.color ?? "";
  throw new StepError(answers[failed]!.error!.code.includes("image") ? "storePhotoFor" : "storeColor", {
    params: { name },
  });
}
