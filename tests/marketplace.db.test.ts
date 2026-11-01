import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/** "I posted it" on Marketplace, the Listings marker, and the remembered card language. */
const enabled = dbEnv();

describe.skipIf(!enabled)("Marketplace helper (MariaDB)", async () => {
  const { getPool, selectOne } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { saveWorkspaceSettings, setMarketplaceLang } = await import("@/server/db/workspaces");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  let listingId = "";

  beforeAll(async () => {
    const jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, jobId)).listings[0]!.id;
  });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  const marked = async () => {
    const page = await A.listingPage({ status: null, q: "", page: 1 });
    return page.rows.find((r) => r.id === listingId)!.marketplace;
  };

  it("records the post and its link, and keeps the first time on a second tap", async () => {
    expect(await marked()).toBe(false);
    expect(await A.setMarketplacePosted(listingId, { url: null })).toBe(true);
    const first = (await A.getListing(listingId))!;
    expect(first.marketplace_posted_at).toBeInstanceOf(Date);
    expect(first.marketplace_url).toBeNull();

    await A.setMarketplacePosted(listingId, { url: "https://www.facebook.com/marketplace/item/1/" });
    const second = (await A.getListing(listingId))!;
    expect(second.marketplace_posted_at).toEqual(first.marketplace_posted_at);
    expect(second.marketplace_url).toBe("https://www.facebook.com/marketplace/item/1/");
    expect(await marked()).toBe(true);
    // it is the seller's own note, so the listing's status is untouched
    expect(second.status).toBe(first.status);
  });

  it("can be undone, and another shop can't touch it", async () => {
    expect(await forWorkspace(b.workspace.id).setMarketplacePosted(listingId, null)).toBe(false);
    expect(await marked()).toBe(true);
    await A.setMarketplacePosted(listingId, null);
    const row = (await A.getListing(listingId))!;
    expect(row.marketplace_posted_at).toBeNull();
    expect(row.marketplace_url).toBeNull();
    expect(await marked()).toBe(false);
  });

  it("remembers the card's language without disturbing the other settings", async () => {
    await setMarketplaceLang(a.workspace.id, "bn");
    const read = async () =>
      (await selectOne<{ s: string }>("SELECT settings_json AS s FROM workspaces WHERE id = ?", [a.workspace.id]))!.s;
    const settings = (raw: unknown) => (typeof raw === "string" ? JSON.parse(raw) : raw);
    expect(settings(await read())).toMatchObject({ marketplaceLang: "bn", brandVoice: "Friendly" });
    // a later Settings save starts from the workspace it read, which carries the choice
    await saveWorkspaceSettings(a.workspace.id, "test shop", { ...a.workspace.settings, marketplaceLang: "bn" });
    expect(settings(await read()).marketplaceLang).toBe("bn");
  });
});
