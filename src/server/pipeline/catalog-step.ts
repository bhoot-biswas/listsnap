import "server-only";
import { reopenDoneStep, sqlStepStore, updateDoneStepResult } from "@/server/db/steps";
import { forWorkspace, type ListingRow } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { csvShop } from "@/server/export/build";
import { catalogItems } from "@/server/export/formats";
import { facebook } from "@/server/providers";
import { metaConnection } from "@/server/social/connection";
import { metaRefusal, metaRefused } from "@/server/social/meta-health";
import { listingProduct } from "@/server/stores/listing-product";
import { catalogAccess } from "@/lib/meta-access";
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
  /** Our ids of the items sent, so the next save removes the ones the listing no longer has. */
  retailerIds?: string[];
  /** Meta's batch, kept while unchecked so "Check again" can ask about it later. */
  handle?: string | null;
  /** Items Meta refused while the others were saved, in Meta's words. */
  refused?: { id: string; message: string }[];
  /** When it was sent (ISO), to tell when the listing changed since. */
  savedAt?: string;
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
  // read before reopening: it names the items sent last time
  const before = await ws.stepResult<CatalogResult>(listing.job_id, "catalog", listingId);
  if (opts.update) await reopenDoneStep(ws.id, key);
  // pressing the button again is the seller's "Try again"
  const outcome = await runStep(sqlStepStore(ws.id), key, { lockMs: LOCK_MS, force: true }, () =>
    send(workspace, listing, wait, before),
  );
  return { found: true, outcome };
}

async function send(
  workspace: Workspace,
  listing: ListingRow,
  wait: (ms: number) => Promise<unknown>,
  before: CatalogResult | null,
): Promise<CatalogResult> {
  const ws = forWorkspace(workspace.id);
  const conn = await metaConnection(ws);
  const userToken = conn?.userToken();
  // an expired login would only get Meta's refusal, so ask for a new one straight away
  if (!conn || !userToken || catalogAccess(conn.settings.userTokenExpiresAt).state === "expired")
    throw new StepError("connectCatalog");
  const catalog = conn.settings.catalogs.find((c) => c.id === conn.settings.catalogId);
  if (!catalog) throw new StepError("chooseCatalog");
  // Meta refuses an item without a page to buy it on, and a store draft has no public page
  if (!workspace.settings.website) throw new StepError("catalogNeedsWebsite");

  const product = await listingProduct(ws, workspace, listing);
  const items = catalogItems([product], await csvShop(workspace, [{ product, bn: null }], CATALOG_LINK_TTL_S));
  if (!items.length) throw new StepError("addPriceFirst");

  const ctx = { workspaceId: ws.id, jobId: listing.job_id, step: "catalog" };
  const retailerIds = items.map((i) => i.id);
  const removeIds =
    before?.catalogId === catalog.id ? (before.retailerIds ?? []).filter((id) => !retailerIds.includes(id)) : [];
  const result = (checked: boolean, extra: Partial<CatalogResult> = {}): CatalogResult => ({
    catalogId: catalog.id,
    catalogName: catalog.name,
    items: items.length,
    checked,
    retailerIds,
    savedAt: new Date().toISOString(),
    ...extra,
  });
  try {
    const handle = await facebook().saveCatalogItems(ctx, { catalogId: catalog.id, userToken, items, removeIds });
    for (let i = 0; i < STATUS_TRIES; i++) {
      const batch = await facebook().catalogBatch(ctx, { catalogId: catalog.id, userToken, handle });
      if (batch.done) {
        const refused = refusedItems(batch.errors, removeIds);
        // nothing went in: say why, as a failure; some did: say which were refused
        if (refused.length === items.length)
          throw new StepError("metaSaid", { params: { message: refused[0]!.message }, permanent: true });
        return result(true, refused.length ? { refused } : {});
      }
      await wait(STATUS_WAIT_MS);
    }
    return result(false, { handle });
  } catch (err) {
    // the login ended early (password changed, access removed): it counts as ended, so
    // every catalog button says to connect again instead of failing one by one
    if (!metaRefusal(err)) throw err;
    await metaRefused(ws, "user");
    throw new StepError("connectCatalog", { permanent: true });
  }
}

/** Meta's refusals; one about removing an old item (already gone, say) says nothing about this save. */
function refusedItems(errors: { id: string; message: string }[], removed: string[]) {
  return errors.filter((e) => e.message && !removed.includes(e.id)).map((e) => ({ id: e.id, message: e.message }));
}

/**
 * "Check again" on a save Meta hadn't finished checking: asks about that batch once, and
 * keeps the answer as the save's result. A save already checked comes back as it is.
 */
export async function checkCatalog(workspace: Workspace, listingId: string): Promise<CatalogResult | null> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return null;
  const saved = await ws.stepResult<CatalogResult>(listing.job_id, "catalog", listingId);
  if (!saved || saved.checked || !saved.handle) return saved;
  const conn = await metaConnection(ws);
  const userToken = conn?.userToken();
  if (!userToken) throw new StepError("connectCatalog");
  const ctx = { workspaceId: ws.id, jobId: listing.job_id, step: "catalog" };
  let batch;
  try {
    batch = await facebook().catalogBatch(ctx, { catalogId: saved.catalogId, userToken, handle: saved.handle });
  } catch (err) {
    if (!metaRefusal(err)) throw err;
    await metaRefused(ws, "user");
    throw new StepError("connectCatalog");
  }
  if (!batch.done) return saved;
  const refused = refusedItems(batch.errors, []);
  const checked: CatalogResult = { ...saved, checked: true, handle: null, ...(refused.length && { refused }) };
  await updateDoneStepResult(ws.id, { jobId: listing.job_id, step: "catalog", target: listingId }, checked);
  return checked;
}
