import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/** Archiving hides and restores; deleting an account takes its shop's rows and photos with it. */
const enabled = dbEnv();

describe.skipIf(!enabled)("archive and account deletion (MariaDB)", async () => {
  const { execute, getPool, selectOne } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { ops } = await import("@/server/ops");
  const { deleteSoleWorkspaces } = await import("@/server/db/workspaces");
  const { removeWorkspaceMedia } = await import("@/server/media/store");
  const { env } = await import("@/server/env");

  const a = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  let jobId = "";
  let listingId = "";

  beforeAll(async () => {
    jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, jobId)).listings[0]!.id;
  });

  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  const listed = async () => (await A.listingPage({ status: null, q: "", page: 1 })).rows.map((r) => r.id);
  const archived = async () =>
    (await A.listingPage({ status: null, q: "", page: 1, archived: true })).rows.map((r) => r.id);

  it("hides an archived listing from the lists and brings it back", async () => {
    await ops.archiveListing.call(a.workspace, { listingId }, { via: "ui" });
    expect(await listed()).not.toContain(listingId);
    expect(await archived()).toContain(listingId);
    expect((await A.statusCounts()).archived).toBe(1);
    expect((await A.recentListings()).map((r) => r.id)).not.toContain(listingId);

    await ops.archiveListing.call(a.workspace, { listingId, archived: false }, { via: "ui" });
    expect(await listed()).toContain(listingId);
    expect((await A.statusCounts()).archived).toBeUndefined();
  });

  it("archives a job with its listings, and restores only the ones archived with it", async () => {
    const second = await createTestJob(a.workspace.id, await samplePhoto("kurti.jpg"));
    const [own] = (await runJob(a.workspace, second)).listings;
    // archived on its own first, so restoring the job must leave it archived
    await ops.archiveListing.call(a.workspace, { listingId: own!.id }, { via: "ui" });
    await ops.archiveJob.call(a.workspace, { jobId }, { via: "ui" });
    expect(await listed()).not.toContain(listingId);
    expect((await A.getJob(jobId))!.archived_at).not.toBeNull();

    await ops.archiveJob.call(a.workspace, { jobId, archived: false }, { via: "ui" });
    expect(await listed()).toContain(listingId);
    expect(await listed()).not.toContain(own!.id);
  });

  it("deletes a user's own shop, its rows and its photos, and leaves a shared shop", async () => {
    const userId = randomUUID();
    await execute(
      "INSERT INTO `user` (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'Leaving', ?, 1, NOW(3), NOW(3))",
      [userId, `${userId}@example.test`],
    );
    const own = await createTestWorkspace();
    const shared = await createTestWorkspace();
    const other = randomUUID();
    await execute(
      "INSERT INTO `user` (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'Staying', ?, 1, NOW(3), NOW(3))",
      [other, `${other}@example.test`],
    );
    for (const [u, w] of [
      [userId, own.workspace.id],
      [userId, shared.workspace.id],
      [other, shared.workspace.id],
    ])
      await execute("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?, ?, 'owner')", [u, w]);
    const job = await createTestJob(own.workspace.id, await samplePhoto("saree.jpg"));
    const folder = path.join(env().mediaDir, own.workspace.id);
    expect(existsSync(folder)).toBe(true);

    const ids = await deleteSoleWorkspaces(userId);
    for (const id of ids) await removeWorkspaceMedia(id);

    expect(ids).toEqual([own.workspace.id]);
    expect(await selectOne("SELECT id FROM jobs WHERE id = ?", [job])).toBeNull();
    expect(existsSync(folder)).toBe(false);
    expect(await selectOne("SELECT id FROM workspaces WHERE id = ?", [shared.workspace.id])).not.toBeNull();

    await execute("DELETE FROM `user` WHERE id IN (?, ?)", [userId, other]);
    await shared.remove();
  });
});
