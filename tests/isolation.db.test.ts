import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto, widePhoto } from "./db-helpers";

/**
 * Shop B holding shop A's ids must find nothing and change nothing. Operations and chat
 * tools will take ids from requests and from a model, so this has to hold in the data
 * layer itself, not only in the code that calls it.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("workspace isolation (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { readMedia } = await import("@/server/media/store");
  const { applyChoice, executeJobStep, executeListingStep } = await import("@/server/pipeline/execute");
  const { loadJobState } = await import("@/server/pipeline/job-state");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  const B = forWorkspace(b.workspace.id);

  // what shop A has, and a snapshot of it to compare against after B's attempts
  let jobId = "";
  let waitingJobId = "";
  let listingId = "";
  let photoId = "";
  let itemId = "";
  let mediaIds: string[] = [];
  let snapshot = "";
  const snap = async () =>
    JSON.stringify({
      job: await A.getJob(jobId),
      waiting: await A.getJob(waitingJobId),
      photos: await A.photos(jobId),
      items: await A.items(jobId),
      waitingItems: await A.items(waitingJobId),
      listings: await A.listings(jobId),
      waitingListings: await A.listings(waitingJobId),
      steps: await A.steps(jobId),
    });

  beforeAll(async () => {
    jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    const state = await runJob(a.workspace, jobId);
    listingId = state.listings[0]!.id;
    photoId = state.photos[0]!.id;
    itemId = state.items[0]!.id;
    mediaIds = [...state.listings[0]!.images.map((i) => i.id), (await A.photos(jobId))[0]!.media_id];
    waitingJobId = await createTestJob(a.workspace.id, await widePhoto());
    await runJob(a.workspace, waitingJobId);
    snapshot = await snap();
  });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  it("finds none of A's records", async () => {
    expect(await B.getJob(jobId)).toBeNull();
    expect(await B.photos(jobId)).toEqual([]);
    expect(await B.items(jobId)).toEqual([]);
    expect(await B.listings(jobId)).toEqual([]);
    expect(await B.getListing(listingId)).toBeNull();
    expect(await B.steps(jobId)).toEqual([]);
    expect(await B.stepResult(jobId, "plan")).toBeNull();
    expect(await B.apiCalls(jobId)).toEqual([]);
    expect(await B.listingMedia([listingId])).toEqual([]);
    expect((await B.recentListings(50)).map((l) => l.id)).not.toContain(listingId);
  });

  it("can't read A's media files", async () => {
    expect(mediaIds.length).toBeGreaterThanOrEqual(3);
    for (const id of mediaIds) {
      expect(await readMedia(a.workspace.id, id)).not.toBeNull();
      expect(await readMedia(b.workspace.id, id)).toBeNull();
    }
  });

  it("can't run, choose for or load A's jobs and listings", async () => {
    expect(await executeJobStep(b.workspace, jobId, "plan", true)).toEqual({ found: false });
    expect(await executeListingStep(b.workspace, listingId, "write", { force: true })).toEqual({ found: false });
    expect(await executeListingStep(b.workspace, listingId, "render", { scene: "studio" })).toEqual({ found: false });
    expect(await applyChoice(b.workspace, waitingJobId, { mode: "separate", keepItemIds: [itemId] })).toBe("not_found");
    expect(await loadJobState(b.workspace, jobId)).toBeNull();
  });

  it("changes nothing of A's through any write", async () => {
    await B.updateJob(jobId, { status: "failed", groupMode: "set" });
    expect(await B.transitionJob(jobId, "ready", "failed")).toBe(false);
    await B.setPhotoCheck(photoId, { hacked: true });
    await B.setItemColors([{ itemId, color: "Hacked" }]);
    await B.saveListingText(listingId, "en", { title: "Hacked" }, { status: "failed" });
    await B.setListingStatus(listingId, "failed");
    await B.saveListingEdits(listingId, {
      en: { title: "Hacked" },
      bn: null,
      priceBdt: 1,
      stockQty: 1,
      selectedMediaIds: [],
    });
    await B.markInStore(listingId, "woo", "999");
    expect(await snap()).toBe(snapshot);
  });

  it("can't attach listings or items to A's job and photo", async () => {
    expect(await B.createListings(waitingJobId, [{ itemIds: [itemId] }])).toEqual([]);
    expect(
      await B.replaceItems(photoId, [{ box: { x: 0, y: 0, w: 1, h: 1 }, score: 1, cutoutMediaId: mediaIds[0]! }]),
    ).toEqual([]);
    expect(await snap()).toBe(snapshot);
    // and nothing was written under B's name pointing at A's rows either
    const { select } = await import("@/server/db/pool");
    expect(
      await select("SELECT id FROM listings WHERE workspace_id = ? AND job_id = ?", [b.workspace.id, waitingJobId]),
    ).toEqual([]);
    expect(
      await select("SELECT id FROM items WHERE workspace_id = ? AND photo_id = ?", [b.workspace.id, photoId]),
    ).toEqual([]);
  });
});
