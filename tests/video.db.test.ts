import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv, runJob, sampleVideo } from "./db-helpers";

// A video batch through the mock providers: watched once, one job per product, each
// starting with what the seller said about it.
const enabled = dbEnv();

describe.skipIf(!enabled)("listings from a video (mock providers, MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { saveMedia } = await import("@/server/media/store");
  const { executeWatchStep } = await import("@/server/pipeline/execute");
  const { loadBatchState } = await import("@/server/pipeline/batch-state");

  const shop = await createTestWorkspace({ scenes: ["studio"], listingLanguages: ["en"] });
  const ws = forWorkspace(shop.workspace.id);

  afterAll(async () => {
    await shop.remove();
    await getPool().end();
  });

  it("watches the video once and makes a job per product with its spoken price", async () => {
    const media = await saveMedia(ws.id, "video", await sampleVideo(), {
      mime: "video/mp4",
      width: 0,
      height: 0,
      selected: false,
    });
    const batchId = await ws.createVideoBatch(media.id);

    const before = await loadBatchState(shop.workspace, batchId);
    expect(before?.rows).toEqual([]);
    expect(before?.watch).toMatchObject({ status: "pending", url: `/api/batches/${batchId}/watch` });

    const watched = await executeWatchStep(shop.workspace, batchId, "127.0.0.1");
    expect(watched).toMatchObject({ found: true, outcome: { state: "done", result: { found: 2, jobs: 2 } } });
    // a second tab, or a retry, gets the saved answer and no second set of jobs
    await executeWatchStep(shop.workspace, batchId, "127.0.0.1");
    const jobIds = await ws.batchJobIds(batchId);
    expect(jobIds).toHaveLength(2);
    expect((await ws.getBatch(batchId))?.total).toBe(2);

    const state = await runJob(shop.workspace, jobIds[1]!);
    expect(state.steps.find((s) => s.step === "listen")?.status).toBe("done");
    const listing = await ws.getListing(state.listings[0]!.id);
    // the mock seller priced the saree at ৳4500 with three in stock
    expect(listing!.price_bdt).toBe(4500);
    expect(listing!.stock_qty).toBe(3);

    const after = await loadBatchState(shop.workspace, batchId);
    expect(after?.watch).toMatchObject({ status: "done", url: null, found: 2 });
  });
});
