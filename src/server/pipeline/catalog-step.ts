import "server-only";
import { reopenDoneStep, sqlStepStore } from "@/server/db/steps";
import { forWorkspace, type ListingRow } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { csvShop } from "@/server/export/build";
import { catalogItems } from "@/server/export/formats";
import { facebook } from "@/server/providers";
import { metaConnection } from "@/server/social/connection";
import { listingProduct } from "@/server/stores/listing-product";
import { runStep, StepError, type StepOutcome } from "./run-step";

/**
 * "Save to Facebook catalog": the listing's product, or one item per colour, sent to the
 * catalog chosen in Connections. Under the step rules like a store save, so a double tap
 * reuses the result, and "Update" sends the latest edits to the same items (Meta matches
 * them by our SKU, so nothing is ever copied).
 */

export interface CatalogResult {
  catalogId: string;
  catalogName: string;
  items: number;
  /** Meta checked the items before we stopped waiting; otherwise it is still working on them. */
  checked: boolean;
}

/**
 * Meta keeps re-downloading catalog photos long after a save, and an item whose photo
 * link has expired loses its picture and stops being eligible. A year outlasts how long
 * a listing is usually for sale; "Update the catalog" sends fresh links anyway.
 */
export const CATALOG_LINK_TTL_S = 365 * 24 * 3600;

// Meta checks a small batch within seconds; past this it carries on without us waiting
const STATUS_TRIES = 8;
const STATUS_WAIT_MS = 2_000;
const LOCK_MS = 60_000;
const SAVABLE = new Set<ListingRow["status"]>(["ready", "needs_review", "in_store", "posted"]);

type Found = { found: false } | { found: true; invalid: string } | { found: true; outcome: StepOutcome<CatalogResult> };

export async function saveToCatalog(
  workspace: Workspace,
  listingId: string,
  opts: { update?: boolean } = {},
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<Found> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  if (!SAVABLE.has(listing.status)) return { found: true, invalid: "This listing isn't finished yet." };
  const key = { jobId: listing.job_id, step: "catalog", target: listingId };
  if (opts.update) await reopenDoneStep(ws.id, key);
  // pressing the button again is the seller's "Try again"
  const outcome = await runStep(sqlStepStore(ws.id), key, { lockMs: LOCK_MS, force: true }, () =>
    send(workspace, listing, wait),
  );
  return { found: true, outcome };
}

async function send(
  workspace: Workspace,
  listing: ListingRow,
  wait: (ms: number) => Promise<unknown>,
): Promise<CatalogResult> {
  const ws = forWorkspace(workspace.id);
  const conn = await metaConnection(ws);
  const userToken = conn?.userToken();
  if (!conn || !userToken) throw new StepError("connectCatalog");
  const catalog = conn.settings.catalogs.find((c) => c.id === conn.settings.catalogId);
  if (!catalog) throw new StepError("chooseCatalog");
  // Meta refuses an item without a page to buy it on, and a store draft has no public page
  if (!workspace.settings.website) throw new StepError("catalogNeedsWebsite");

  const product = await listingProduct(ws, workspace, listing);
  const items = catalogItems([product], await csvShop(workspace, [{ product, bn: null }], CATALOG_LINK_TTL_S));
  if (!items.length) throw new StepError("addPriceFirst");

  const ctx = { workspaceId: ws.id, jobId: listing.job_id, step: "catalog" };
  const handle = await facebook().saveCatalogItems(ctx, { catalogId: catalog.id, userToken, items });
  for (let i = 0; i < STATUS_TRIES; i++) {
    const batch = await facebook().catalogBatch(ctx, { catalogId: catalog.id, userToken, handle });
    if (batch.done) {
      const refused = batch.errors.find((e) => e.message);
      if (refused) throw new StepError("metaSaid", { params: { message: refused.message }, permanent: true });
      return { catalogId: catalog.id, catalogName: catalog.name, items: items.length, checked: true };
    }
    await wait(STATUS_WAIT_MS);
  }
  return { catalogId: catalog.id, catalogName: catalog.name, items: items.length, checked: false };
}
