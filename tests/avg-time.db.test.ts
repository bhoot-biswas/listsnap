import { afterAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * The dashboard's average time covers photo in to listing written. A reel or catalog save the
 * seller runs days later on the same job must not count towards it.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("average listing time (MariaDB)", async () => {
  const { execute, getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");

  const shop = await createTestWorkspace();
  const ws = forWorkspace(shop.workspace.id);

  afterAll(async () => {
    await shop.remove();
    await getPool().end();
  });

  it("leaves out steps the seller runs later", async () => {
    const job = await createTestJob(shop.workspace.id, await samplePhoto("saree.jpg"));
    await runJob(shop.workspace, job);
    const before = (await ws.dashboardStats()).avgSeconds;
    expect(before).not.toBeNull();

    // a reel made two days on
    await execute(
      `INSERT INTO job_steps (job_id, workspace_id, step, status, attempts, started_at, finished_at)
       VALUES (?, ?, 'reel', 'done', 1, UTC_TIMESTAMP(3) + INTERVAL 2 DAY, UTC_TIMESTAMP(3) + INTERVAL 2 DAY)`,
      [job, shop.workspace.id],
    );
    expect((await ws.dashboardStats()).avgSeconds).toBe(before);
  });
});
