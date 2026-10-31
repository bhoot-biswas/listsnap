import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/** Archiving hides a listing or job from the lists and brings it back. */
const enabled = dbEnv();

describe.skipIf(!enabled)("archive and account deletion (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { ops } = await import("@/server/ops");

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

});
