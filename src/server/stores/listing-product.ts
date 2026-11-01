import "server-only";
import type { ItemRow, ListingRow, WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import type { StoreDraftInput } from "@/server/providers/types";
import { StepError } from "@/server/pipeline/run-step";
import { ListingText } from "@/lib/schemas/pipeline";
import { listingPrice } from "@/lib/schemas/review";
import { listingVariants } from "@/lib/variants";

/** A listing as a product, before it has a store: what a store save and an export both send. */
export type ListingProduct = Omit<StoreDraftInput, "productRef">;

/**
 * Turns a listing into the product a store gets, in one place, so a direct save and an
 * exported file always agree on price, photos and colours. Throws `textMissing` for a
 * listing with no English text.
 */
export async function listingProduct(
  ws: WorkspaceScope,
  workspace: Workspace,
  listing: ListingRow,
): Promise<ListingProduct> {
  const en = ListingText.safeParse(listing.fields_json?.en);
  if (!en.success) throw new StepError("textMissing");
  const text = en.data;
  const [job, items, media] = await Promise.all([
    ws.getJob(listing.job_id),
    ws.items(listing.job_id),
    ws.listingMedia([listing.id]),
  ]);
  const price = listingPrice(listing.price_bdt, text.price_hint_bdt, workspace.settings.priceRounding);
  const colors = listingVariants(job?.group_mode ?? null, listing.item_ids_json, items, listing.fields_json?.variants)
    ?.filter((v) => v.on)
    .map((v) => ({
      itemId: v.itemId,
      color: v.color,
      regularPrice: v.priceBdt ?? price,
      stockQty: v.stockQty,
      mediaId: items.find((i) => i.id === v.itemId)?.cutout_media_id ?? null,
    }));
  return {
    listingId: listing.id,
    title: text.title,
    description: text.description,
    shortDescription: text.short_description,
    category: text.category,
    regularPrice: price,
    stockQty: listing.stock_qty,
    tags: text.tags,
    attributes: text.attributes,
    images: images(listing, items, media, text.title, colors ?? []),
    variants: colors?.length ? colors : null,
  };
}

/**
 * The white main image first, then the scenes the seller kept, in their saved order,
 * then each other colour's image, so the gallery shows every colour on sale.
 */
function images(
  listing: ListingRow,
  items: ItemRow[],
  media: { id: string; kind: string; selected: number | boolean | null }[],
  title: string,
  colors: { color: string; mediaId: string | null }[],
) {
  const main = items.find((i) => i.id === listing.item_ids_json[0])?.cutout_media_id;
  const list = [...(main ? [{ mediaId: main, alt: title }] : [])];
  // a reel is a video for social posts, never a product image
  for (const m of media) if (m.selected && m.kind !== "reel") list.push({ mediaId: m.id, alt: title });
  for (const c of colors)
    if (c.mediaId && !list.some((x) => x.mediaId === c.mediaId))
      list.push({ mediaId: c.mediaId, alt: `${title}, ${c.color}` });
  return list;
}
