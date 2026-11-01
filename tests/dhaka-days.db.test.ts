import { afterAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * Stats count Dhaka days: a listing made a minute after midnight in Dhaka is today's, one
 * made a minute before is yesterday's, though both fall on the same UTC date.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("Dhaka days in stats (MariaDB)", async () => {
  const { execute, getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { dhakaDay, DHAKA_OFFSET_MS } = await import("@/lib/dhaka-day");

  const shop = await createTestWorkspace();
  const ws = forWorkspace(shop.workspace.id);

  afterAll(async () => {
    await shop.remove();
    await getPool().end();
  });

  it("puts listings either side of Dhaka midnight on their own days", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const job = await createTestJob(shop.workspace.id, await samplePhoto("saree.jpg"));
      ids.push((await runJob(shop.workspace, job)).listings[0]!.id);
    }
    // midnight in Dhaka today, as a UTC moment
    const midnight = Date.parse(`${dhakaDay()}T00:00:00Z`) - DHAKA_OFFSET_MS;
    const at = (ms: number) => new Date(ms).toISOString().slice(0, 23).replace("T", " ");
    await execute("UPDATE listings SET created_at = ? WHERE id = ?", [at(midnight + 60_000), ids[0]]);
    await execute("UPDATE listings SET created_at = ? WHERE id = ?", [at(midnight - 60_000), ids[1]]);

    const stats = await ws.dashboardStats();
    expect(stats.listedToday).toBe(1);
    expect(stats.listedYesterday).toBe(1);

    const week = await ws.listingsPerDay();
    expect(week.slice(-2)).toEqual([
      { day: dhakaDay(Date.now(), 1), n: 1 },
      { day: dhakaDay(), n: 1 },
    ]);

    const month = await ws.usageDays();
    expect(month.at(-1)).toMatchObject({ day: dhakaDay(), listings: 1 });
    expect(month.at(-2)).toMatchObject({ day: dhakaDay(Date.now(), 1), listings: 1 });
  });
});
