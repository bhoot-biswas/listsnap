import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * When Meta stops accepting one of the seller's logins: a refused catalog login counts as
 * ended, a refused Page login makes the connection broken, and "Test now" asks Meta about both.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("Facebook connection health (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { finishLogin } = await import("@/server/social/meta-connect");
  const { metaConnection, readyCatalog } = await import("@/server/social/connection");
  const { metaPageWorks, metaRefused, recheckMetaLogins } = await import("@/server/social/meta-health");
  const { connectionsOverview } = await import("@/server/connections/overview");
  const { saveToCatalog } = await import("@/server/pipeline/catalog-step");
  const { mockFacebook } = await import("@/server/providers/fb/mock");
  const { GraphError } = await import("@/server/providers/graph");

  const a = await createTestWorkspace({ website: "https://rupkotha.example" });
  const A = forWorkspace(a.workspace.id);
  const noWait = async () => {};
  let listingId = "";
  const metaStatus = async () => (await connectionsOverview(a.workspace)).services.find((s) => s.service === "meta");

  beforeAll(async () => {
    const job = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, job)).listings[0]!.id;
    await finishLogin(a.workspace.id, "mock-code");
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await a.remove();
    await getPool().end();
  });

  it("counts a catalog login Meta refuses as ended, without breaking reels", async () => {
    expect(readyCatalog(await metaConnection(A), "https://rupkotha.example")).not.toBeNull();
    const refused = vi
      .spyOn(mockFacebook, "saveCatalogItems")
      .mockRejectedValueOnce(new GraphError(400, 190, "metaAuth"));
    const r = await saveToCatalog(a.workspace, listingId, {}, noWait);
    refused.mockRestore();
    expect(r.found && "outcome" in r && r.outcome.state === "failed" && r.outcome.error).toMatch(/connectCatalog/);
    // used up at once: trying again can't help until the seller connects again
    expect(r.found && "outcome" in r && r.outcome.state === "failed" && r.outcome.exhausted).toBe(true);

    const conn = (await metaConnection(A))!;
    expect(new Date(conn.settings.userTokenExpiresAt!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(readyCatalog(conn, "https://rupkotha.example")).toBeNull();
    expect(conn.broken).toBe(false);
    expect(await metaStatus()).toMatchObject({ status: "connected" });
    expect((await A.storeConnection("meta"))!.checks_json).toEqual([{ id: "user", status: "fail" }]);
  });

  it("shows a refused Page login as broken until a post works again", async () => {
    await metaRefused(A, "page");
    expect((await metaConnection(A))!.broken).toBe(true);
    expect(await metaStatus()).toMatchObject({ status: "broken" });
    expect((await metaStatus())!.checkedAt).toBeInstanceOf(Date);

    await metaPageWorks(A);
    expect((await metaConnection(A))!.broken).toBe(false);
    expect(await metaStatus()).toMatchObject({ status: "connected" });
  });

  it("asks Meta about both logins on Test now", async () => {
    // a fresh login gives catalogs a new date
    await finishLogin(a.workspace.id, "mock-code");
    const check = vi.spyOn(mockFacebook, "checkToken");

    check.mockImplementation(async (_ctx, token) => (token === "mock-user-token" ? "refused" : "ok"));
    await recheckMetaLogins(A);
    expect((await A.storeConnection("meta"))!.checks_json).toEqual([
      { id: "page", status: "pass" },
      { id: "user", status: "fail" },
    ]);
    expect(await metaStatus()).toMatchObject({ status: "connected" });
    expect(readyCatalog(await metaConnection(A), "https://rupkotha.example")).toBeNull();

    check.mockResolvedValue("refused");
    await recheckMetaLogins(A);
    expect(await metaStatus()).toMatchObject({ status: "broken" });

    check.mockResolvedValue("ok");
    await recheckMetaLogins(A);
    expect(await metaStatus()).toMatchObject({ status: "connected" });
    check.mockRestore();
  });

  it("leaves a test Page alone", async () => {
    const t = await createTestWorkspace();
    const T = forWorkspace(t.workspace.id);
    const { encryptSecret } = await import("@/server/crypto");
    await T.saveConnection("meta", {
      baseUrl: null,
      credentialsEnc: encryptSecret("test-page-token"),
      checks: null,
      settings: { pageId: "1", pageName: "Test Page", igUserId: null, igUsername: null, test: true },
    });
    await metaRefused(T, "page");
    expect((await metaConnection(T))!.broken).toBe(false);
    await t.remove();
  });
});
