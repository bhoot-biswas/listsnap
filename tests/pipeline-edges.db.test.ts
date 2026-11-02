import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, createTestJob, dbEnv, runJob, samplePhoto, widePhoto } from "./db-helpers";

/**
 * A day with no AI photos left: every studio photo fails for good. Listings must still be
 * written and settle, on their own page and as bulk rows, instead of waiting forever.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("pipeline with photos used up (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { applyChoice } = await import("@/server/pipeline/execute");
  const { loadBatchState } = await import("@/server/pipeline/batch-state");
  const { normalisePhoto, saveMedia } = await import("@/server/media/store");

  const a = await createTestWorkspace();
  // no AI photos today: every render is refused before Muse Image is called
  a.workspace.limits.images = 0;
  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  it("writes every separate listing even after the first two have no photos", async () => {
    const jobId = await createTestJob(a.workspace.id, await widePhoto());
    const waiting = await runJob(a.workspace, jobId);
    const keep = waiting.items.map((i) => i.id);
    expect(keep).toHaveLength(3);
    expect(await applyChoice(a.workspace, jobId, { mode: "separate", keepItemIds: keep })).toBe("ok");

    const done = await runJob(a.workspace, jobId);
    expect(done.next).toEqual([]);
    expect(done.status).not.toBe("processing");
    expect(done.listings).toHaveLength(3);
    for (const l of done.listings) expect(l.status).not.toBe("processing");
    const renders = done.steps.filter((s) => s.step === "render");
    expect(renders).toHaveLength(3);
    expect(renders.every((s) => s.exhausted && s.errorKey === "imagesUsedUp")).toBe(true);
  });

  it("shows a bulk row with no studio photo as its listing, not Stuck", async () => {
    const ws = forWorkspace(a.workspace.id);
    const batchId = await ws.createBatch(1);
    const p = await normalisePhoto(await samplePhoto("saree.jpg"));
    const media = await saveMedia(a.workspace.id, "original", p.data, {
      mime: "image/jpeg",
      width: p.width,
      height: p.height,
    });
    const jobId = await ws.createJob([{ mediaId: media.id, width: p.width, height: p.height }], batchId);
    await runJob(a.workspace, jobId);

    const [row] = (await loadBatchState(a.workspace, batchId))!.rows;
    expect(row!.listing?.status).toMatch(/^(ready|needs_review)$/);
    expect(row!.stuck).toBe(false);
    expect(row!.photosMissing).toBeGreaterThan(0);
  });
});
