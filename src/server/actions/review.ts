"use server";

import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
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
  await ws.saveListingEdits(listingId, {
    ...parsed.data,
    selectedMediaIds: parsed.data.selectedMediaIds.filter((id) => own.has(id)),
  });
  return { ok: true };
}
