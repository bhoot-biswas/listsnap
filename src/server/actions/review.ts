"use server";

import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { ops, type OpResult } from "@/server/ops";

export type SaveEditResult = { ok: true } | { ok: false; error: "invalid" | "not_found" };

const toSaveResult = (r: OpResult<unknown>): SaveEditResult =>
  r.ok ? { ok: true } : { ok: false, error: r.error === "not_found" ? "not_found" : "invalid" };

/**
 * Autosave from Review. The op checks the whole edit with Zod and keeps the listing as
 * it was, so the change can be undone. Re-checks the session, as every action does.
 */
export async function saveListingEdit(listingId: string, input: unknown): Promise<SaveEditResult> {
  const viewer = await requireWorkspace();
  return toSaveResult(await ops.saveListingEdit.call(viewer.workspace, { listingId, edit: input }, { via: "ui" }));
}

/**
 * Inline edits from the bulk table: title, category and price only. Everything else on
 * the listing is kept as it is, including the photos the seller chose.
 */
export async function quickEditListing(listingId: string, input: unknown): Promise<SaveEditResult> {
  const viewer = await requireWorkspace();
  const patch = input && typeof input === "object" ? input : {};
  return toSaveResult(await ops.editListingFields.call(viewer.workspace, { ...patch, listingId }, { via: "ui" }));
}

const Checked = z.object({ listingId: z.string().min(1).max(64), checked: z.boolean() });

/**
 * Review's checklist: every item ticked moves the listing from Needs review to Ready, and
 * unticking one moves it back. Not an op, so the chat can't tick checks for the seller.
 */
export async function setListingChecked(listingId: unknown, checked: unknown): Promise<{ ok: boolean }> {
  const viewer = await requireWorkspace();
  const parsed = Checked.safeParse({ listingId, checked });
  if (!parsed.success) return { ok: false };
  await forWorkspace(viewer.workspace.id).setChecked(parsed.data.listingId, parsed.data.checked);
  return { ok: true };
}
