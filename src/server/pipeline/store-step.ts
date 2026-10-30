import "server-only";
import { reopenDoneStep, sqlStepStore } from "@/server/db/steps";
import { forWorkspace, type ItemRow, type ListingRow, type WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { woo } from "@/server/providers";
import { resolveWooStore } from "@/server/stores/woo-store";
import { ListingText } from "@/lib/schemas/pipeline";
import { suggestedPrice } from "@/lib/schemas/review";
import { listingVariants } from "@/lib/variants";
import { runStep, StepError } from "./run-step";
import type { ExecuteResult } from "./execute";

/**
 * "Save as draft in store" (S8). Not part of the automatic pipeline: the seller starts
 * it, but it runs under the same step rules, so a double click or a retry after a
 * timeout reuses the saved product instead of making a second draft.
 */

export interface StoreResult {
  productId: number;
  editUrl: string;
}

// the store downloads every image while creating the product, which can take a while
const LOCK_MS = 90_000;
const SAVABLE = new Set<ListingRow["status"]>(["ready", "needs_review", "in_store", "posted"]);

export async function executeStoreStep(
  workspace: Workspace,
  listingId: string,
  opts: { update?: boolean } = {},
): Promise<ExecuteResult | { found: true; invalid: string }> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  if (!SAVABLE.has(listing.status)) return { found: true, invalid: "This listing isn't finished yet." };
  // "Update store draft": send the seller's edits to the same product again
  if (opts.update) await reopenDoneStep(ws.id, { jobId: listing.job_id, step: "store", target: listingId });
  // pressing the button again is the seller's "Try again", so a used-up step may run once more
  const outcome = await runStep(
    sqlStepStore(ws.id),
    { jobId: listing.job_id, step: "store", target: listingId },
    { lockMs: LOCK_MS, force: true },
    () => saveDraft(ws, workspace, listing),
  );
  return { found: true, outcome };
}

async function saveDraft(ws: WorkspaceScope, workspace: Workspace, listing: ListingRow): Promise<StoreResult> {
  const en = ListingText.safeParse(listing.fields_json?.en);
  if (!en.success) throw new StepError("The listing text is missing. Make the listing again.");
  const text = en.data;
  const step = { workspaceId: ws.id, jobId: listing.job_id, step: "store" };
  // mock mode needs no store, so a shop without a connection can still try the flow
  const target = woo().mode === "mock" ? null : await resolveWooStore(workspace);
  const [job, items, media] = await Promise.all([
    ws.getJob(listing.job_id),
    ws.items(listing.job_id),
    ws.listingMedia([listing.id]),
  ]);
  const price = listing.price_bdt ?? suggestedPrice(text.price_hint_bdt, workspace.settings.priceRounding);
  const colors = listingVariants(job?.group_mode ?? null, listing.item_ids_json, items, listing.fields_json?.variants)
    ?.filter((v) => v.on)
    .map((v) => ({
      itemId: v.itemId,
      color: v.color,
      regularPrice: v.priceBdt ?? price,
      stockQty: v.stockQty,
      mediaId: items.find((i) => i.id === v.itemId)?.cutout_media_id ?? null,
    }));
  const saved = await woo().saveDraft(step, target?.store ?? null, {
    listingId: listing.id,
    productId: listing.wc_product_id,
    title: text.title,
    description: text.description,
    shortDescription: text.short_description,
    category: text.category,
    fallbackCategoryId: target?.settings.defaultCategoryId ?? null,
    regularPrice: price,
    stockQty: listing.stock_qty,
    tags: text.tags,
    attributes: text.attributes,
    images: images(listing, items, media, text.title, colors ?? []),
    variants: colors?.length ? colors : null,
  });
  await ws.markInStore(listing.id, saved.productId);
  return saved;
}

export { suggestedPrice };

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
