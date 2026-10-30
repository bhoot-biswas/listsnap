import "server-only";
import { z } from "zod";
import { REELS_PER_DAY } from "@/server/db/limits";
import { executeStoreStep } from "@/server/pipeline/store-step";
import { metaConnection } from "@/server/social/connection";
import { defineOp } from "./define-op";
import { ListingId } from "./listing-ops";

/**
 * Ops over the whole shop, for the shop chat: find listings, see where the shop stands,
 * and save several listings to the store under one approval.
 */

const STATUSES = ["processing", "needs_review", "ready", "in_store", "posted", "failed"] as const;

export const getShopSummary = defineOp({
  name: "getShopSummary",
  description:
    "Read where the shop stands: how many listings have each status, AI photos and reels left today, and the connected Facebook Page and Instagram account.",
  input: z.object({}),
  effect: "read",
  async run({ workspace, ws }) {
    const [counts, usage, meta] = await Promise.all([ws.statusCounts(), ws.usageToday(), metaConnection(ws)]);
    return {
      ok: true,
      value: {
        shop: workspace.name,
        listingsByStatus: counts,
        aiPhotosLeftToday: Math.max(0, workspace.limits.images - usage.images),
        reelsLeftToday: Math.max(0, REELS_PER_DAY - usage.reels),
        facebookPage: meta?.settings.pageName ?? null,
        instagram: meta?.settings.igUsername ?? null,
      },
    };
  },
});

export const findListings = defineOp({
  name: "findListings",
  description:
    "Find the shop's listings, newest first, 20 per page: optionally by status (processing, needs_review, ready, in_store, posted, failed) and by words in the English or Bangla title. Listings that are posted are in the store too. Returns ids to use with the other tools.",
  input: z.object({
    status: z.enum(STATUSES).optional(),
    query: z.string().trim().max(100).optional(),
    page: z.number().int().min(1).max(50).default(1),
  }),
  effect: "read",
  async run({ ws }, { status, query, page }) {
    const { rows, total } = await ws.listingPage({ status: status ?? null, q: query ?? "", page });
    return {
      ok: true,
      value: {
        total,
        page,
        listings: rows.map((r) => ({
          id: r.id,
          jobId: r.job_id,
          title: r.title,
          titleBn: r.title_bn,
          status: r.status,
          category: r.category,
          priceBdt: r.price_bdt,
        })),
      },
    };
  },
});

/**
 * One approval for several drafts. Each listing runs as its own store step, so one that
 * fails doesn't stop the rest, and one already saved isn't saved twice.
 */
export const saveDraftsToStore = defineOp({
  name: "saveDraftsToStore",
  description:
    "Save several finished listings (up to 20) to the shop's WooCommerce store as draft products, never published. Needs the seller's confirmation; listings already in the store are left as they are.",
  input: z.object({ listingIds: z.array(ListingId).min(1).max(20) }),
  effect: "changes_store",
  async run({ workspace, ws }, { listingIds }) {
    const ids = [...new Set(listingIds)];
    // all or nothing on ownership: one id from another shop means the request is wrong
    if ((await Promise.all(ids.map((id) => ws.getListing(id)))).some((l) => !l))
      return { ok: false, error: "not_found" };
    const saved: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      const r = await executeStoreStep(workspace, id);
      if (!r.found) failed.push({ id, message: "That isn't in this shop." });
      else if ("invalid" in r) failed.push({ id, message: r.invalid });
      else if (r.outcome.state === "done") saved.push(id);
      else if (r.outcome.state === "running") failed.push({ id, message: "Still saving; check again in a moment." });
      else failed.push({ id, message: r.outcome.error });
    }
    return { ok: true, value: { saved, failed }, summary: `${saved.length} saved, ${failed.length} not` };
  },
});
