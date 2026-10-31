import "server-only";
import { z } from "zod";
import type { ListingSnapshot } from "@/server/db/scope";
import { ListingEdit, suggestedPrice } from "@/lib/schemas/review";
import { defineOp } from "./define-op";

/** Ids are opaque here; an unknown or foreign one is "not found", not "invalid". */
export const ListingId = z.string().min(1).max(64);

export const getListingSummary = defineOp({
  name: "getListingSummary",
  description:
    "Read one listing's current state: status, English and Bangla titles, category, price, stock, the AI's confidence and review notes, and its photos. Use it before changing a listing.",
  input: z.object({ listingId: ListingId }),
  effect: "read",
  async run({ workspace, ws }, { listingId }) {
    const listing = await ws.getListing(listingId);
    if (!listing) return { ok: false, error: "not_found" };
    const [items, media] = await Promise.all([ws.items(listing.job_id), ws.listingMedia([listingId])]);
    const en = listing.fields_json?.en as
      { title?: string; category?: string; price_hint_bdt?: { low: number; high: number } } | undefined;
    const bn = listing.fields_json?.bn as { title?: string } | undefined;
    const main = items.find((i) => i.id === listing.item_ids_json[0])?.cutout_media_id ?? null;
    return {
      ok: true,
      value: {
        id: listing.id,
        status: listing.status,
        title: en?.title ?? null,
        titleBn: bn?.title ?? null,
        category: en?.category ?? null,
        priceBdt: listing.price_bdt,
        // Review shows this until the seller sets a price, and the store gets it
        suggestedPriceBdt:
          listing.price_bdt === null && en?.price_hint_bdt
            ? suggestedPrice(en.price_hint_bdt, workspace.settings.priceRounding)
            : null,
        stockQty: listing.stock_qty,
        confidence: listing.confidence,
        checkNotes: listing.check_notes ?? [],
        inStore: listing.wc_product_id !== null,
        photos: [
          ...(main ? [{ id: main, kind: "main", selected: true }] : []),
          ...media.map((m) => ({ id: m.id, kind: m.kind, selected: !!m.selected })),
        ],
      },
    };
  },
});

/**
 * Review's autosave: the whole edit each time. Only scene media of this listing can be
 * selected, and colours can only name its own items.
 */
export const saveListingEdit = defineOp({
  name: "saveListingEdit",
  description:
    "Replace a listing's editable content (English and Bangla text, price, stock, chosen photos, colour variants) with a complete edit, as the Review page sends it. Can be undone.",
  input: z.object({ listingId: ListingId, edit: ListingEdit }),
  effect: "edits_draft",
  async run({ ws }, { listingId, edit }) {
    const listing = await ws.getListing(listingId);
    const before = listing ? await ws.listingSnapshot(listingId) : null;
    if (!listing || !before) return { ok: false, error: "not_found" };
    const own = new Set((await ws.listingMedia([listingId])).map((m) => m.id));
    const items = new Set(listing.item_ids_json);
    const variants = edit.variants?.filter((v) => items.has(v.itemId)) ?? null;
    if (variants && !variants.some((v) => v.on)) return { ok: false, error: "invalid" };
    await ws.saveListingEdits(listingId, {
      ...edit,
      selectedMediaIds: edit.selectedMediaIds.filter((id) => own.has(id)),
      variants,
    });
    return { ok: true, value: { saved: true }, listingId, summary: "full edit", undo: before };
  },
});

/** Inline edits from the bulk table: title, category and price only; the rest stays. */
export const editListingFields = defineOp({
  name: "editListingFields",
  description:
    "Change a listing's English title, category or price (in taka). Give only the fields to change; everything else stays as it is. Can be undone.",
  input: z.object({
    listingId: ListingId,
    title: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().max(120).optional(),
    priceBdt: z.number().int().min(0).max(10_000_000).nullable().optional(),
  }),
  effect: "edits_draft",
  async run({ ws }, { listingId, title, category, priceBdt }) {
    const listing = await ws.getListing(listingId);
    const before = listing ? await ws.listingSnapshot(listingId) : null;
    if (!listing || !before) return { ok: false, error: "not_found" };
    await ws.saveListingEdits(listingId, {
      en: { ...(title !== undefined ? { title } : {}), ...(category !== undefined ? { category } : {}) },
      bn: null,
      priceBdt: priceBdt !== undefined ? priceBdt : listing.price_bdt,
      stockQty: listing.stock_qty,
      selectedMediaIds: before.selectedMediaIds,
    });
    const changed = [
      title !== undefined && "title",
      category !== undefined && "category",
      priceBdt !== undefined && "price",
    ];
    return {
      ok: true,
      value: { saved: true },
      listingId,
      summary: changed.filter(Boolean).join(", ") || "nothing",
      undo: before,
    };
  },
});

export const undoLast = defineOp({
  name: "undoLast",
  description:
    "Undo the most recent change to a listing's text, price, stock or chosen photos. Calling it again goes one change further back.",
  input: z.object({ listingId: ListingId }),
  effect: "edits_draft",
  async run({ ws }, { listingId }) {
    if (!(await ws.getListing(listingId))) return { ok: false, error: "not_found" };
    const last = await ws.lastUndoable(listingId);
    if (!last) return { ok: false, error: "not_ready", message: "There's nothing to undo on this listing." };
    // claim first, so two undos at once can't both restore the same snapshot
    if (!(await ws.markUndone(last.id))) return { ok: false, error: "busy" };
    await ws.restoreListing(listingId, last.undo_json as ListingSnapshot);
    return { ok: true, value: { undone: last.op }, listingId, summary: `undid ${last.op}` };
  },
});

export const archiveListing = defineOp({
  name: "archiveListing",
  description:
    "Archive a listing the seller doesn't want (a wrong detection, a test): it leaves Listings, the dashboard and the media library but nothing is deleted. archived false brings it back.",
  input: z.object({ listingId: ListingId, archived: z.boolean().default(true) }),
  effect: "edits_draft",
  async run({ ws }, { listingId, archived }) {
    if (!(await ws.getListing(listingId))) return { ok: false, error: "not_found" };
    const changed = await ws.setListingArchived(listingId, archived);
    return { ok: true, value: { archived, changed }, listingId, summary: archived ? "archived" : "restored" };
  },
});

export const archiveJob = defineOp({
  name: "archiveJob",
  description:
    "Archive a whole job (a photo and every listing made from it), for one that failed or was started by mistake. Nothing is deleted; archived false brings the job and those listings back.",
  input: z.object({ jobId: z.string().min(1).max(64), archived: z.boolean().default(true) }),
  effect: "edits_draft",
  async run({ ws }, { jobId, archived }) {
    if (!(await ws.getJob(jobId))) return { ok: false, error: "not_found" };
    const changed = await ws.setJobArchived(jobId, archived);
    return { ok: true, value: { archived, changed }, summary: archived ? "archived job" : "restored job" };
  },
});
