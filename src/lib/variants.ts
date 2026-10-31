import { z } from "zod";

/**
 * Colour variants: one listing for the same design in several colours, sold as a
 * variable product (WooCommerce) or a product with a Color option (Shopify). Each SAM item is one colour. The seller's edits live in
 * the listing's fields (`fields_json.variants`); until then they come from Spark's
 * colour names on the items.
 */

export const COLOR_MAX = 40;

export const Variant = z.object({
  itemId: z.string().uuid(),
  color: z.string().trim().min(1).max(COLOR_MAX),
  /** Null uses the listing's price. */
  priceBdt: z.number().int().min(0).max(10_000_000).nullable(),
  /** Null leaves this colour's stock unmanaged. */
  stockQty: z.number().int().min(0).max(1_000_000).nullable(),
  /** Off keeps the colour out of the store without forgetting the seller's edits. */
  on: z.boolean(),
});
export type Variant = z.infer<typeof Variant>;

export const Variants = z
  .array(Variant)
  .min(1)
  .max(12)
  .refine((v) => v.some((x) => x.on), "At least one colour")
  .refine((v) => new Set(v.map((x) => x.itemId)).size === v.length, "One row per item")
  .refine(
    (v) => new Set(v.filter((x) => x.on).map((x) => x.color.toLowerCase())).size === v.filter((x) => x.on).length,
    "Colour names differ",
  );

/**
 * The listing's colours, or null when it isn't a variant listing. Saved edits win, but
 * only for items still in the listing, and any item without a saved row is added, so a
 * stale or partial save never hides a colour.
 */
export function listingVariants(
  groupMode: string | null,
  itemIds: string[],
  items: { id: string; color: string | null }[],
  saved: unknown,
): Variant[] | null {
  if (groupMode !== "variants" || itemIds.length < 2) return null;
  const parsed = z.array(Variant).safeParse(saved);
  const byItem = new Map((parsed.success ? parsed.data : []).map((v) => [v.itemId, v]));
  const color = new Map(items.map((i) => [i.id, i.color?.trim() ?? ""]));
  return itemIds.map(
    (id, n) =>
      byItem.get(id) ?? {
        itemId: id,
        color: (color.get(id) || `Color ${n + 1}`).slice(0, COLOR_MAX),
        priceBdt: null,
        stockQty: null,
        on: true,
      },
  );
}

/** Spark often lists every colour as one "Color" detail; the variation attribute replaces it. */
export const isColorAttribute = (name: string) => /^colou?r$/i.test(name.trim());
