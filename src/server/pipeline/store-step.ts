import "server-only";
import { reopenDoneStep, sqlStepStore } from "@/server/db/steps";
import { forWorkspace, type ItemRow, type ListingRow, type WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { shopify, woo } from "@/server/providers";
import type { StoreDraftInput } from "@/server/providers/types";
import { resolveWooStore } from "@/server/stores/woo-store";
import { resolveShopifyStore, shopifySettings } from "@/server/stores/shopify-store";
import { storeTargets } from "@/server/stores/targets";
import { storedError } from "@/server/step-text";
import { ListingText } from "@/lib/schemas/pipeline";
import { listingPrice, suggestedPrice } from "@/lib/schemas/review";
import { listingVariants } from "@/lib/variants";
import { STORE_NAMES, storeStep, type StoreKind } from "@/lib/stores";
import { runStep, StepError, type StepOutcome } from "./run-step";

/**
 * "Save as draft in store" (S8). Not part of the automatic pipeline: the seller starts
 * it, but it runs under the same step rules, so a double click or a retry after a
 * timeout reuses the saved product instead of making a second draft. A shop with two
 * stores saves to each under its own step, so one store failing never undoes the other.
 */

export interface StoreResult {
  /** Older WooCommerce results kept a number in `productId` instead. */
  productRef: string;
  editUrl: string;
}

export interface StoresResult {
  stores: ({ kind: StoreKind } & StoreResult)[];
}

// the store downloads every image while creating the product, which can take a while
const LOCK_MS = 90_000;
const SAVABLE = new Set<ListingRow["status"]>(["ready", "needs_review", "in_store", "posted"]);

type Found = { found: false } | { found: true; invalid: string } | { found: true; outcome: StepOutcome<StoresResult> };

/**
 * Saves to the given stores, or to every store the shop saves drafts to. The outcome is
 * done when every store is; a failure names its store when there is more than one.
 */
export async function saveToStores(
  workspace: Workspace,
  listingId: string,
  opts: { stores?: StoreKind[]; update?: boolean } = {},
): Promise<Found> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  if (!SAVABLE.has(listing.status)) return { found: true, invalid: "This listing isn't finished yet." };
  const targets = opts.stores?.length ? opts.stores : await storeTargets(workspace);
  if (!targets.length)
    return {
      found: true,
      outcome: { state: "failed", error: storedError("connectStore"), attempts: 0, exhausted: true },
    };

  const outcomes: { kind: StoreKind; outcome: StepOutcome<StoreResult> }[] = [];
  for (const kind of targets) {
    const key = { jobId: listing.job_id, step: storeStep(kind), target: listingId };
    // "Update store draft": send the seller's edits to the same product again
    if (opts.update) await reopenDoneStep(ws.id, key);
    // pressing the button again is the seller's "Try again", so a used-up step may run once more
    const outcome = await runStep(sqlStepStore(ws.id), key, { lockMs: LOCK_MS, force: true }, () =>
      saveDraft(ws, workspace, listing, kind),
    );
    outcomes.push({ kind, outcome });
  }
  return { found: true, outcome: combine(outcomes) };
}

function combine(outcomes: { kind: StoreKind; outcome: StepOutcome<StoreResult> }[]): StepOutcome<StoresResult> {
  if (outcomes.some((o) => o.outcome.state === "running")) return { state: "running" };
  const failed = outcomes.find((o) => o.outcome.state === "failed");
  if (failed && failed.outcome.state === "failed") {
    const error =
      outcomes.length > 1
        ? storedError("storeFailedIn", { store: STORE_NAMES[failed.kind], message: failed.outcome.error })
        : failed.outcome.error;
    return { ...failed.outcome, error };
  }
  return {
    state: "done",
    fresh: outcomes.some((o) => o.outcome.state === "done" && o.outcome.fresh),
    result: {
      stores: outcomes.flatMap((o) => (o.outcome.state === "done" ? [{ kind: o.kind, ...o.outcome.result }] : [])),
    },
  };
}

async function saveDraft(
  ws: WorkspaceScope,
  workspace: Workspace,
  listing: ListingRow,
  kind: StoreKind,
): Promise<StoreResult> {
  const en = ListingText.safeParse(listing.fields_json?.en);
  if (!en.success) throw new StepError("textMissing");
  const text = en.data;
  // api_calls keeps one "store" step for usage, whichever store it was
  const ctx = { workspaceId: ws.id, jobId: listing.job_id, step: "store" };
  const [job, items, media, refs] = await Promise.all([
    ws.getJob(listing.job_id),
    ws.items(listing.job_id),
    ws.listingMedia([listing.id]),
    ws.storeProducts([listing.id]),
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
  const input: StoreDraftInput = {
    listingId: listing.id,
    productRef: refs.get(listing.id)?.[kind] ?? null,
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

  let saved;
  if (kind === "woo") {
    // mock mode needs no store, so a shop without a connection can still try the flow
    const target = woo().mode === "mock" ? null : await resolveWooStore(workspace);
    saved = await woo().saveDraft(ctx, target?.store ?? null, {
      ...input,
      fallbackCategoryId: target?.settings.defaultCategoryId ?? null,
    });
  } else {
    const target = shopify().mode === "mock" ? null : await resolveShopifyStore(workspace, ctx);
    const settings = target?.settings ?? (await shopifySettings(workspace));
    saved = await shopify().saveDraft(ctx, target?.store ?? null, { ...input, locationId: settings.locationId });
  }
  await ws.markInStore(listing.id, kind, saved.productRef);
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
