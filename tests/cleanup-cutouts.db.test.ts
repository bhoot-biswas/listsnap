import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, samplePhoto } from "./db-helpers";

/**
 * Segment run again replaces a photo's items and leaves the earlier cutouts behind; the
 * nightly cleanup finds those, and only those. Run as --dry-run, so nothing in the
 * database it shares with other tests is deleted.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("unused cutout sweep (MariaDB)", async () => {
  const { execute, getPool, select } = await import("@/server/db/pool");
  const { sqlStepStore } = await import("@/server/db/steps");
  const { executeJobStep } = await import("@/server/pipeline/execute");

  const a = await createTestWorkspace();
  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  const due = async () => {
    const { stdout } = await promisify(execFile)("node", ["scripts/cleanup-demo.mjs", "--dry-run"], {
      env: process.env,
    });
    return Number(/(\d+) unused cutout\(s\) due/.exec(stdout)?.[1]);
  };

  it("finds the cutouts a second segment run left behind, once they are a day old", async () => {
    const jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    await executeJobStep(a.workspace, jobId, "plan");
    await executeJobStep(a.workspace, jobId, "segment");
    const first = await select<{ id: string }>(
      "SELECT id FROM media WHERE workspace_id = ? AND kind IN ('main', 'cutout')",
      [a.workspace.id],
    );
    const base = await due();
    // a retry: the step runs again and replaces the items
    await sqlStepStore(a.workspace.id).reset({ jobId, step: "segment", target: "-" }, { done: true });
    await executeJobStep(a.workspace, jobId, "segment");

    // fresh leftovers wait a day, so a segment step running now is never swept
    expect(await due()).toBe(base);
    await execute(
      `UPDATE media SET created_at = UTC_TIMESTAMP(3) - INTERVAL 2 DAY WHERE id IN (${first.map(() => "?").join(",")})`,
      first.map((m) => m.id),
    );
    expect(await due()).toBe(base + first.length);

    // the second run's cutouts are in use and never count, however old
    await execute(
      "UPDATE media SET created_at = UTC_TIMESTAMP(3) - INTERVAL 2 DAY WHERE workspace_id = ? AND kind IN ('main', 'cutout')",
      [a.workspace.id],
    );
    expect(await due()).toBe(base + first.length);
  });
});
