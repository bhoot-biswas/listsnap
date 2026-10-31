import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * The bulk page reads a whole batch in one query per table; each row must still say what
 * the job's own state says, so the batch runner calls exactly what the job page would.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("batch state (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { loadBatchState } = await import("@/server/pipeline/batch-state");
  const { loadJobState } = await import("@/server/pipeline/job-state");
  const { executeJobStep } = await import("@/server/pipeline/execute");
  const { normalisePhoto, saveMedia } = await import("@/server/media/store");

  const a = await createTestWorkspace();
  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  it("gives every job the same status, listing and next calls as its own page", async () => {
    const ws = forWorkspace(a.workspace.id);
    const batchId = await ws.createBatch(3);
    const p = await normalisePhoto(await samplePhoto("saree.jpg"));
    const jobs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const media = await saveMedia(a.workspace.id, "original", p.data, {
        mime: "image/jpeg",
        width: p.width,
        height: p.height,
      });
      jobs.push(await ws.createJob([{ mediaId: media.id, width: p.width, height: p.height }], batchId));
    }
    await runJob(a.workspace, jobs[0]!); // finished
    await executeJobStep(a.workspace, jobs[1]!, "plan"); // part way
    // the third hasn't started

    const batch = (await loadBatchState(a.workspace, batchId))!;
    expect(batch.rows.map((r) => r.jobId)).toEqual(jobs);
    for (const row of batch.rows) {
      const own = (await loadJobState(a.workspace, row.jobId))!;
      expect(row.jobStatus).toBe(own.status);
      expect(row.next).toEqual(own.next);
      expect(row.listingCount).toBe(own.listings.length);
      expect(row.listing?.id ?? null).toBe(own.listings[0]?.id ?? null);
      expect(row.listing?.title ?? null).toBe(own.listings[0]?.title ?? null);
      expect(row.thumbUrl).toBe(own.listings[0]?.images.find((i) => i.kind === "main")?.url ?? null);
      expect(row.stuck).toBe(own.steps.some((s) => s.exhausted));
    }
    expect(batch.rows[0]!.listing).not.toBeNull();
    expect(batch.rows[2]!.next.map((n) => n.key)).toEqual(["plan"]);
  });
});
