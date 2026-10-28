"use server";

import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { z } from "zod";
import { ListingEdit } from "@/lib/schemas/review";

export type SaveEditResult = { ok: true } | { ok: false; error: "invalid" | "not_found" };

/**
 * Autosave from Review. The whole edit arrives each time and is checked with Zod; only
 * scene media that belong to this listing can be selected. Re-checks the session, as
 * every action does.
 */
export async function saveListingEdit(listingId: string, input: unknown): Promise<SaveEditResult> {
  const viewer = await requireWorkspace();
  const parsed = ListingEdit.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ws = forWorkspace(viewer.workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { ok: false, error: "not_found" };
  const own = new Set((await ws.listingMedia([listingId])).map((m) => m.id));
  // colours can only name items of this listing
  const items = new Set(listing.item_ids_json);
  const variants = parsed.data.variants?.filter((v) => items.has(v.itemId)) ?? null;
  if (variants && !variants.some((v) => v.on)) return { ok: false, error: "invalid" };
  await ws.saveListingEdits(listingId, {
    ...parsed.data,
    selectedMediaIds: parsed.data.selectedMediaIds.filter((id) => own.has(id)),
    variants,
  });
  return { ok: true };
}

const QuickEdit = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(120).optional(),
  priceBdt: z.number().int().min(0).max(10_000_000).nullable().optional(),
});

/**
 * Inline edits from the bulk table: title, category and price only. Everything else on
 * the listing is kept as it is, including the photos the seller chose.
 */
export async function quickEditListing(listingId: string, input: unknown): Promise<SaveEditResult> {
  const viewer = await requireWorkspace();
  const parsed = QuickEdit.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ws = forWorkspace(viewer.workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { ok: false, error: "not_found" };
  const { title, category, priceBdt } = parsed.data;
  const media = await ws.listingMedia([listingId]);
  await ws.saveListingEdits(listingId, {
    en: { ...(title !== undefined ? { title } : {}), ...(category !== undefined ? { category } : {}) },
    bn: null,
    priceBdt: priceBdt !== undefined ? priceBdt : listing.price_bdt,
    stockQty: listing.stock_qty,
    selectedMediaIds: media.filter((m) => m.selected).map((m) => m.id),
  });
  return { ok: true };
}
