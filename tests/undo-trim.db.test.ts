import { afterAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * Autosave and the chat both make undoable edits, and every one trims the listing's undo
 * history. Trimming used to lock the shop's other op rows, so edits saved at the same
 * moment deadlocked and the seller was told a saved change had failed.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("undo history under concurrent edits (MariaDB)", async () => {
  const { getPool, select } = await import("@/server/db/pool");
  const { ops } = await import("@/server/ops");
  const shops = await Promise.all(Array.from({ length: 6 }, () => createTestWorkspace()));

  afterAll(async () => {
    for (const s of shops) await s.remove();
    await getPool().end();
  });

  it("saves every edit when several shops edit at once, and keeps the newest 50 snapshots", async () => {
    const photo = await samplePhoto("saree.jpg");
    const listings = await Promise.all(
      shops.map(async (s) => (await runJob(s.workspace, await createTestJob(s.workspace.id, photo))).listings[0]!.id),
    );
    const failed: unknown[] = [];
    // two edits per listing at a time, 60 each: past the 50 kept, so trimming runs throughout
    for (let round = 0; round < 30; round++) {
      const results = await Promise.all(
        shops.flatMap((s, i) =>
          [0, 1].map((k) =>
            ops.editListingFields.call(
              s.workspace,
              { listingId: listings[i]!, title: `Title ${round}.${k}` },
              { via: "ui" },
            ),
          ),
        ),
      );
      failed.push(...results.filter((r) => !r.ok));
    }
    expect(failed).toEqual([]);
    const kept = await select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM op_runs WHERE listing_id IN (${listings.map(() => "?").join(", ")}) AND undo_json IS NOT NULL GROUP BY listing_id`,
      listings,
    );
    expect(kept.map((r) => Number(r.n))).toEqual([50, 50, 50, 50, 50, 50]);
  }, 120_000);
});
