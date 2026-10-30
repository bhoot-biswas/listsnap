import "server-only";
import { z } from "zod";
import { REELS_PER_DAY } from "@/server/db/limits";
import { takeListingSlot } from "@/server/limits";
import { executeStoreStep } from "@/server/pipeline/store-step";
import { metaConnection } from "@/server/social/connection";
import { defineOp } from "./define-op";
import { ListingId } from "./listing-ops";
import { errorText } from "@/server/step-text";

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
    "Find the shop's listings, newest first, 20 per page: optionally by status (processing, needs_review, ready, in_store, posted, failed) and by a word in the English or Bangla title (search with the bare product word, like 'kurti' or 'কুর্তি', without endings such as -র or -টা). Listings that are posted are in the store too. Returns ids to use with the other tools.",
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
 * A new listing from photos the seller attached in the chat: the same job Snap makes,
 * so the pipeline runs as it always does once the seller opens it. A photo becomes one
 * listing only, and it takes a listing slot exactly as Snap does, demo visitors included.
 */
export const startListing = defineOp({
  name: "startListing",
  description:
    "Start a new listing from photos the seller attached in this chat (their ids are in the message), all of one product. ListSnap then writes its English and Bangla text and makes a studio photo; it uses one of today's listings. For several products, call it once per product.",
  input: z.object({ photoIds: z.array(z.string().min(1).max(36)).min(1).max(5) }),
  effect: "starts_listing",
  async run({ workspace, ws, meta }, { photoIds }) {
    const ids = [...new Set(photoIds)];
    const photos = await ws.chatPhotos(ids);
    if (photos.length !== ids.length) return { ok: false, error: "not_found" };
    if (photos.some((p) => p.used))
      return { ok: false, error: "invalid", message: "That photo is already a listing. Send a new photo for another." };
    // a demo shop without the visitor's address would skip the per-visitor limit
    if (workspace.isDemo && !meta.clientIp) return { ok: false, error: "not_ready" };
    const release = await takeListingSlot(ws, workspace, meta.clientIp ?? "");
    if (!release)
      return {
        ok: false,
        error: "failed",
        message: "You've made today's listings. Your limit resets at 6:00 AM Bangladesh time.",
      };
    try {
      // in the order the seller attached them, so the first is the main photo
      const byId = new Map(photos.map((p) => [p.id, p]));
      const jobId = await ws.createJob(
        ids.map((id) => ({ mediaId: id, width: byId.get(id)!.width, height: byId.get(id)!.height })),
      );
      return { ok: true, value: { jobId, href: `/job/${jobId}` }, summary: `${ids.length} photos` };
    } catch (err) {
      await release();
      throw err;
    }
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
      // only the chat calls this, and the model reads English
      else failed.push({ id, message: errorText(r.outcome.error, "en") });
    }
    return { ok: true, value: { saved, failed }, summary: `${saved.length} saved, ${failed.length} not` };
  },
});
