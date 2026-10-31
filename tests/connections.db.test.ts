import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv } from "./db-helpers";

/** The one-line-per-service overview that Connections and its detail pages read. */
const enabled = dbEnv();

describe.skipIf(!enabled)("Connections overview (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { connectionsOverview } = await import("@/server/connections/overview");

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
      ["woo", "store", "none"],
      ["shopify", "store", "none"],
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
    expect(o.services[0]).toMatchObject({ status: "broken", address: "myshop.example", saveDrafts: false });
    expect(o.services[1]).toMatchObject({ status: "demo", address: null, saveDrafts: true });
    // another shop sees none of it
    expect(await statuses(b.workspace)).toEqual({ woo: "none", shopify: "none", meta: "none" });
  });

  it("drops a disconnected store back to not connected", async () => {
    await forWorkspace(a.workspace.id).disconnect("shopify");
    const o = await connectionsOverview(a.workspace);
    expect(o.services[1]!.status).toBe("none");
    expect(o.severalStores).toBe(false);
  });

  it("gives a demo shop only our test store, and its Facebook row", async () => {
    expect(await statuses({ ...b.workspace, isDemo: true })).toEqual({ woo: "demo", meta: "none" });
  });
});
