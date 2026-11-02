import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestWorkspace, dbEnv, sampleVideo } from "./db-helpers";

// Work that stops part-way and is asked for again: an approval whose run died, a video
// batch that stopped between two products, and saves that all need a Shopify refresh.
const enabled = dbEnv();

// fails the second product photo of a video once, as a crash between two jobs would
const crash = vi.hoisted(() => ({ armed: false, originals: 0 }));
vi.mock("@/server/media/store", async (orig) => {
  const real = (await orig()) as typeof import("@/server/media/store");
  return {
    ...real,
    saveMedia: async (...args: Parameters<typeof real.saveMedia>) => {
      if (crash.armed && args[1] === "original" && ++crash.originals === 2) {
        crash.armed = false;
        throw new Error("crash between two products");
      }
      return real.saveMedia(...args);
    },
  };
});

describe.skipIf(!enabled)("carrying on after work stopped part-way (MariaDB)", async () => {
  const { execute, getPool, selectOne } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { saveMedia } = await import("@/server/media/store");
  const { executeWatchStep } = await import("@/server/pipeline/execute");
  const { encryptShopifyToken, resolveShopifyStore } = await import("@/server/stores/shopify-store");
  const { mockShopify } = await import("@/server/providers/shopify/mock");

  const shop = await createTestWorkspace({ scenes: ["studio"], listingLanguages: ["en"] });
  const ws = forWorkspace(shop.workspace.id);

  afterAll(async () => {
    await shop.remove();
    await getPool().end();
  });

  it("lets an approval run again once the run that died has had its lease", async () => {
    const key = `approve-${Date.now()}`;
    const run = { op: "saveDraftToStore", via: "chat" as const, idemKey: key };
    expect(await ws.startOpRun(run)).toHaveProperty("id"); // the process dies here
    // straight away, a second tab is still told it's busy
    expect(await ws.startOpRun(run)).toMatchObject({ existing: { status: "running" } });
    await execute(
      "UPDATE op_runs SET lease_until = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE workspace_id = ? AND idem_key = ?",
      [ws.id, key],
    );
    const again = await ws.startOpRun(run);
    expect(again).toHaveProperty("id");
    // and only one caller gets it back
    expect(await ws.startOpRun(run)).toMatchObject({ existing: { status: "running" } });
  });

  it("treats a run from before leases as expired once it is ten minutes old", async () => {
    const key = `old-${Date.now()}`;
    const run = { op: "postReel", via: "chat" as const, idemKey: key };
    await ws.startOpRun(run);
    await execute(
      "UPDATE op_runs SET lease_until = NULL, created_at = UTC_TIMESTAMP(3) - INTERVAL 11 MINUTE WHERE workspace_id = ? AND idem_key = ?",
      [ws.id, key],
    );
    expect(await ws.startOpRun(run)).toHaveProperty("id");
  });

  it("carries on a video batch from the product after the one it stopped at", async () => {
    const media = await saveMedia(ws.id, "video", await sampleVideo(), {
      mime: "video/mp4",
      width: 0,
      height: 0,
      selected: false,
    });
    const batchId = await ws.createVideoBatch(media.id);
    const before = (await ws.usageToday()).listings;
    crash.armed = true;
    crash.originals = 0;

    expect(await executeWatchStep(shop.workspace, batchId, "127.0.0.1")).toMatchObject({
      outcome: { state: "failed", exhausted: false },
    });
    expect(await ws.batchJobIds(batchId)).toHaveLength(1);
    // the failed product's slot came back
    expect((await ws.usageToday()).listings - before).toBe(1);

    expect(await executeWatchStep(shop.workspace, batchId, "127.0.0.1")).toMatchObject({
      outcome: { state: "done", result: { found: 2, jobs: 2, limited: 0 } },
    });
    expect(await ws.batchJobIds(batchId)).toHaveLength(2);
    expect((await ws.batchStep(batchId, "watch"))?.status).toBe("done");
    expect((await ws.usageToday()).listings - before).toBe(2);
    // the video was watched once: the second attempt used the saved products
    const calls = await selectOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM api_calls WHERE workspace_id = ? AND step = 'watch' AND provider = 'baseten'",
      [ws.id],
    );
    expect(Number(calls!.n)).toBe(1);
  });

  it("serves five saves that all need a refresh with one refresh, without stalling the database", async () => {
    const other = await createTestWorkspace();
    const W = forWorkspace(other.workspace.id);
    await W.saveConnection("shopify", {
      baseUrl: `https://own-${other.workspace.id.slice(0, 8)}.myshopify.com`,
      credentialsEnc: encryptShopifyToken({
        accessToken: "old",
        scope: "write_products,read_locations,write_inventory",
        expiresAt: Date.now() - 1_000,
        refreshToken: "mock-refresh-1",
        refreshExpiresAt: Date.now() + 86_400_000,
      }),
      checks: [],
      settings: {},
    });
    await execute("UPDATE store_connections SET status = 'connected' WHERE workspace_id = ? AND kind = 'shopify'", [
      other.workspace.id,
    ]);
    const real = mockShopify.refresh;
    // Shopify takes a moment to answer
    const refresh = vi.spyOn(mockShopify, "refresh").mockImplementation(async (...a) => {
      await new Promise((r) => setTimeout(r, 1_000));
      return real(...a);
    });
    const ctx = { workspaceId: other.workspace.id, jobId: null, step: "store" };
    const t0 = Date.now();
    const stores = await Promise.all([1, 2, 3, 4, 5].map(() => resolveShopifyStore(other.workspace, ctx)));
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(new Set(stores.map((s) => s.store.accessToken)).size).toBe(1);
    expect(stores[0]!.store.accessToken).not.toBe("old");
    refresh.mockRestore();
    await other.remove();
  });
});
