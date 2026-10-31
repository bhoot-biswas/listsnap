import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv } from "./db-helpers";

// The sample listings a new demo shop starts with, read back the way the Dashboard and Usage read them.
const enabled = dbEnv();

describe.skipIf(!enabled)("demo shop samples (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { seedDemoWorkspace } = await import("@/server/demo/seed");
  const { DEMO_SAMPLES } = await import("@/server/demo/samples");

  const shop = await createTestWorkspace();
  const ws = forWorkspace(shop.workspace.id);
  await seedDemoWorkspace(shop.workspace.id);

  afterAll(async () => {
    await shop.remove();
    await getPool().end();
  });

  it("counts the samples in today's usage, so the meter agrees with the Dashboard", async () => {
    const stats = await ws.dashboardStats();
    expect(stats.listedToday).toBe(DEMO_SAMPLES.length);
    expect((await ws.usageToday()).listings).toBe(DEMO_SAMPLES.length);
  });

  it("gives the samples a realistic time per listing instead of 0 s", async () => {
    const { avgSeconds } = await ws.dashboardStats();
    expect(avgSeconds).toBeGreaterThanOrEqual(30);
    expect(avgSeconds).toBeLessThanOrEqual(40);
  });
});
