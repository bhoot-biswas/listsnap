import "server-only";
import { sqlStepStore } from "@/server/db/steps";
import { forWorkspace, type ListingRow, type WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { woo } from "@/server/providers";
import { resolveWooStore } from "@/server/stores/woo-store";
import { ListingText } from "@/lib/schemas/pipeline";
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
): Promise<ExecuteResult | { found: true; invalid: string }> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  if (!SAVABLE.has(listing.status)) return { found: true, invalid: "This listing isn't finished yet." };
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
  const saved = await woo().saveDraft(step, target?.store ?? null, {
    listingId: listing.id,
    productId: listing.wc_product_id,
    title: text.title,
    description: text.description,
    shortDescription: text.short_description,
    category: text.category,
    fallbackCategoryId: target?.settings.defaultCategoryId ?? null,
    regularPrice: suggestedPrice(text.price_hint_bdt, workspace.settings.priceRounding),
    tags: text.tags,
    attributes: text.attributes,
    images: await images(ws, listing, text.title),
  });
  await ws.markInStore(listing.id, saved.productId);
  return saved;
}

/** Middle of Spark's typical range, rounded the shop's way; the seller edits it in Review. */
export function suggestedPrice(hint: { low: number; high: number }, rounding: number): number | null {
  if (!(hint.low > 0 && hint.high >= hint.low)) return null;
  const step = rounding > 0 ? rounding : 1;
  return Math.round((hint.low + hint.high) / 2 / step) * step;
}

/** The white main image first, then the scenes in their saved order. */
async function images(ws: WorkspaceScope, listing: ListingRow, alt: string) {
  const [items, media] = await Promise.all([ws.items(listing.job_id), ws.listingMedia([listing.id])]);
  const main = items.find((i) => i.id === listing.item_ids_json[0])?.cutout_media_id;
  return [...(main ? [main] : []), ...media.map((m) => m.id)].map((mediaId) => ({ mediaId, alt }));
}
