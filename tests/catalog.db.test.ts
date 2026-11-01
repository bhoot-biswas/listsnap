import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/** "Save to Facebook catalog" with the mock Meta: what stops it, what it sends, and repeating it. */
const enabled = dbEnv();

describe.skipIf(!enabled)("Facebook catalog (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { encryptSecret } = await import("@/server/crypto");
  const { finishLogin } = await import("@/server/social/meta-connect");
  const { metaConnection } = await import("@/server/social/connection");
  const { saveToCatalog } = await import("@/server/pipeline/catalog-step");
  const { mockFacebook } = await import("@/server/providers/fb/mock");

  const a = await createTestWorkspace({ website: "https://rupkotha.example" });
  const noSite = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  const noWait = async () => {};
  let listingId = "";
  let otherListing = "";

  const failure = async (workspace: typeof a.workspace, id: string) => {
    const r = await saveToCatalog(workspace, id, {}, noWait);
    return r.found && "outcome" in r && r.outcome.state === "failed" ? r.outcome.error : null;
  };

  beforeAll(async () => {
    const job = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, job)).listings[0]!.id;
    const job2 = await createTestJob(noSite.workspace.id, await samplePhoto("saree.jpg"));
    otherListing = (await runJob(noSite.workspace, job2)).listings[0]!.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await a.remove();
    await noSite.remove();
    await getPool().end();
  });

  it("asks for Facebook with catalog access first; a test Page has none", async () => {
    expect(await failure(a.workspace, listingId)).toMatch(/connectCatalog/);
    await A.saveConnection("meta", {
      baseUrl: null,
      credentialsEnc: encryptSecret("test-page-token"),
      checks: null,
      settings: { pageId: "1", pageName: "Test Page", igUserId: null, igUsername: null, test: true },
    });
    expect((await metaConnection(A))!.userToken()).toBeNull();
    expect(await failure(a.workspace, listingId)).toMatch(/connectCatalog/);
  });

  it("keeps the seller's token and picks their only catalog at login", async () => {
    await finishLogin(a.workspace.id, "mock-code");
    const conn = (await metaConnection(A))!;
    expect(conn.userToken()).toBe("mock-user-token");
    expect(conn.settings).toMatchObject({ catalogAccess: true, catalogId: "900000000000001" });
    // the token never reaches the settings a page renders
    expect(JSON.stringify((await A.storeConnection("meta"))?.settings_json)).not.toContain("mock-user-token");
  });

  it("needs the shop's website, because every item links to it", async () => {
    await forWorkspace(noSite.workspace.id).saveConnection("meta", {
      ...(await A.storeConnection("meta").then((r) => ({
        baseUrl: null,
        credentialsEnc: r!.credentials_enc,
        checks: null,
        settings: r!.settings_json,
      }))),
    });
    expect(await failure(noSite.workspace, otherListing)).toMatch(/catalogNeedsWebsite/);
  });

  it("sends the listing once, returns the saved result again, and resends on update", async () => {
    const send = vi.spyOn(mockFacebook, "saveCatalogItems");
    const first = await saveToCatalog(a.workspace, listingId, {}, noWait);
    if (!first.found || !("outcome" in first)) throw new Error("not found");
    if (first.outcome.state !== "done") throw new Error(JSON.stringify(first.outcome));
    expect(first.outcome.result).toMatchObject({ catalogName: "Rupkotha products", checked: true });
    const items = send.mock.calls[0]![1].items;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({ link: "https://rupkotha.example", condition: "new", brand: "test shop" });
    expect(items[0]!.price).toMatch(/^\d+ BDT$/);
    // Meta re-downloads catalog photos for months, so their links must outlive an import's month
    const expires = Number(new URL(items[0]!.images[0]!).searchParams.get("e"));
    expect(expires * 1000 - Date.now()).toBeGreaterThan(360 * 24 * 3600 * 1000);

    await saveToCatalog(a.workspace, listingId, {}, noWait);
    expect(send).toHaveBeenCalledTimes(1);
    await saveToCatalog(a.workspace, listingId, { update: true }, noWait);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("shows Meta's reason when it refuses an item", async () => {
    vi.spyOn(mockFacebook, "catalogBatch").mockResolvedValueOnce({
      done: true,
      errors: [{ id: "x", message: "Image too small" }],
    });
    const r = await saveToCatalog(a.workspace, listingId, { update: true }, noWait);
    expect(r.found && "outcome" in r && r.outcome.state === "failed" && r.outcome.error).toMatch(/Image too small/);
  });
});
