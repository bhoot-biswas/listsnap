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
