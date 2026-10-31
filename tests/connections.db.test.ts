import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/** What Connections and each service's page read: the overview, and a store's recent activity. */
const enabled = dbEnv();

describe.skipIf(!enabled)("Connections overview (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { connectionsOverview } = await import("@/server/connections/overview");
  const { storeActivity } = await import("@/server/connections/activity");
  const { ops } = await import("@/server/ops");
  const { mockWoo } = await import("@/server/providers/woo/mock");
  const { StepError } = await import("@/server/pipeline/run-step");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  const statuses = async (w: typeof a.workspace) =>
    Object.fromEntries((await connectionsOverview(w)).services.map((s) => [s.service, s.status]));

  it("lists every service as not connected for a new shop", async () => {
    const o = await connectionsOverview(a.workspace);
    expect(o.services.map((s) => [s.service, s.group, s.status])).toEqual([
      ["shopify", "store", "none"],
      ["woo", "store", "none"],
      ["meta", "social", "none"],
    ]);
    expect(o.severalStores).toBe(false);
  });

  it("shows two stores, one broken, with their addresses and draft switches", async () => {
    const A = forWorkspace(a.workspace.id);
    await A.saveConnection("woo", {
      baseUrl: "https://myshop.example",
      credentialsEnc: null,
      checks: [],
      settings: { saveDrafts: false },
    });
    await A.saveConnection("shopify", { baseUrl: null, credentialsEnc: null, checks: [], settings: { demo: true } });
    await A.setConnectionChecks("woo", "broken", []);
    const o = await connectionsOverview(a.workspace);
    expect(o.severalStores).toBe(true);
    const of = (k: string) => o.services.find((s) => s.service === k);
    expect(of("woo")).toMatchObject({ status: "broken", address: "myshop.example", saveDrafts: false });
    expect(of("shopify")).toMatchObject({ status: "demo", address: null, saveDrafts: true });
    // another shop sees none of it
    expect(await statuses(b.workspace)).toEqual({ woo: "none", shopify: "none", meta: "none" });
  });

  it("drops a disconnected store back to not connected", async () => {
    await forWorkspace(a.workspace.id).disconnect("shopify");
    const o = await connectionsOverview(a.workspace);
    expect(o.services.find((s) => s.service === "shopify")!.status).toBe("none");
    expect(o.severalStores).toBe(false);
  });

  it("gives a demo shop only our test store, and its Facebook row", async () => {
    expect(await statuses({ ...b.workspace, isDemo: true })).toEqual({ woo: "demo", meta: "none" });
  });

  describe("recent activity", () => {
    const c = createTestWorkspace();
    const ui = { via: "ui" as const, confirmed: true };

    afterAll(async () => (await c).remove());

    it("lists drafts saved to a store, and a failure only until a later save works", async () => {
      const { workspace } = await c;
      const C = forWorkspace(workspace.id);
      await C.saveConnection("woo", {
        baseUrl: "https://myshop.example",
        credentialsEnc: null,
        checks: [],
        settings: {},
      });
      const jobId = await createTestJob(workspace.id, await samplePhoto("saree.jpg"));
      const listingId = (await runJob(workspace, jobId)).listings[0]!.id;
      expect((await storeActivity(workspace, "woo", "en")).saves).toEqual([]);

      await ops.saveDraftToStore.call(workspace, { listingId }, ui);
      const saved = await storeActivity(workspace, "woo", "en");
      expect(saved.saves).toHaveLength(1);
      expect(saved.saves[0]).toMatchObject({ listingId, href: `/job/${jobId}/review?l=${listingId}` });
      expect(saved.saves[0]!.storeUrl).toMatch(
        /^https:\/\/myshop\.example\/wp-admin\/post\.php\?post=\d+&action=edit$/,
      );
      expect(saved.failure).toBeNull();
      // another shop sees none of it
      expect((await storeActivity(a.workspace, "woo", "en")).saves.map((s) => s.listingId)).not.toContain(listingId);

      const fails = vi.spyOn(mockWoo, "saveDraft").mockRejectedValue(new StepError("storeKeys", { permanent: true }));
      await ops.saveDraftToStore.call(workspace, { listingId, update: true }, ui);
      fails.mockRestore();
      const failed = await storeActivity(workspace, "woo", "bn");
      expect(failed.failure).toMatchObject({ href: `/job/${jobId}/review?l=${listingId}` });
      // the reason is in the seller's language, not the stored key
      expect(failed.failure!.reason).toMatch(/[\u0980-\u09FF]/);

      await ops.saveDraftToStore.call(workspace, { listingId, update: true }, ui);
      expect((await storeActivity(workspace, "woo", "en")).failure).toBeNull();
    });
  });
});
