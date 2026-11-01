"use server";

import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { ops } from "@/server/ops";

const Kind = z.enum(["listing", "job"]);

/**
 * Archive and restore from the app. The ops check the input and the workspace; a
 * restore is the same op with `archived: false`, which is also the toast's Undo.
 */
export async function setArchived(kind: "listing" | "job", id: string, archived: boolean): Promise<{ ok: boolean }> {
  const viewer = await requireWorkspace();
  if (!Kind.safeParse(kind).success) return { ok: false };
  const r =
    kind === "listing"
      ? await ops.archiveListing.call(viewer.workspace, { listingId: id, archived }, { via: "ui" })
      : await ops.archiveJob.call(viewer.workspace, { jobId: id, archived }, { via: "ui" });
  return { ok: r.ok };
}

/** A page of listings is the most one tap can change; the Listings page shows 20. */
const ListingIds = z.array(z.string().min(1).max(64)).min(1).max(50);

/** Archives or restores several listings from Listings; returns the ones that changed. */
export async function setListingsArchived(ids: string[], archived: boolean): Promise<{ ok: boolean; done: string[] }> {
  const viewer = await requireWorkspace();
  const parsed = ListingIds.safeParse(ids);
  if (!parsed.success) return { ok: false, done: [] };
  const done: string[] = [];
  for (const listingId of new Set(parsed.data)) {
    const r = await ops.archiveListing.call(viewer.workspace, { listingId, archived }, { via: "ui" });
    if (r.ok) done.push(listingId);
  }
  return { ok: done.length === parsed.data.length, done };
}
