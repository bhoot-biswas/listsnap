import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * Shopify next to WooCommerce, on the real database with mock stores: connecting over
 * OAuth, saving one listing to both stores under separate steps, a failure in one store
 * not hiding the other, token refreshes that never spend a refresh token twice, and the
 * webhooks that disconnect or forget a store.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("Shopify and two stores (MariaDB)", async () => {
  const { getPool, select } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { ops } = await import("@/server/ops");
  const { finishInstall, readStateCookie, stateCookie, appSecret } = await import("@/server/stores/shopify-connect");
  const { encryptShopifyToken, resolveShopifyStore } = await import("@/server/stores/shopify-store");
  const { storeTargets } = await import("@/server/stores/targets");
  const { mockShopify } = await import("@/server/providers/shopify/mock");
  const { StepError } = await import("@/server/pipeline/run-step");
  const { errorText } = await import("@/server/step-text");
  const { POST: webhook } = await import("@/app/api/shopify/webhooks/route");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  const shop = `test-${a.workspace.id.slice(0, 8)}.myshopify.com`;
  let listingId = "";
  const ui = { via: "ui" as const, confirmed: true };

  beforeAll(async () => {
    const jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, jobId)).listings[0]!.id;
  });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  it("only accepts its own signed, unexpired OAuth state", () => {
    const { value, state } = stateCookie({ workspaceId: a.workspace.id, shop, next: "connections" });
    expect(readStateCookie(value)).toMatchObject({ state, shop, workspaceId: a.workspace.id });
    const [body, mac] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), shop: "x.myshopify.com" }),
    ).toString("base64url");
    expect(readStateCookie(`${forged}.${mac}`)).toBeNull();
    expect(readStateCookie(undefined)).toBeNull();
  });

  it("connects a store over OAuth, choosing a location for stock", async () => {
    expect(await finishInstall(a.workspace.id, shop, "mock-code")).toBeNull();
    const row = await A.storeConnection("shopify");
    expect(row).toMatchObject({ status: "connected", base_url: `https://${shop}` });
    expect(row!.settings_json).toMatchObject({
      locationId: "gid://shopify/Location/1",
      locations: [{ name: "Shop floor" }, { name: "Warehouse" }],
      saveDrafts: true,
    });
    // the token is encrypted at rest
    expect(row!.credentials_enc).not.toContain("mock-access");
  });

  it("won't connect one store to two shops", async () => {
    expect(await finishInstall(b.workspace.id, shop, "mock-code")).toBe("taken");
    expect(await forWorkspace(b.workspace.id).storeConnection("shopify")).toBeNull();
  });

  it("saves one listing to both stores, each under its own step, and only once", async () => {
    await A.saveConnection("woo", { baseUrl: null, credentialsEnc: null, checks: [], settings: { demo: true } });
    expect(await storeTargets(a.workspace)).toEqual(["woo", "shopify"]);
    const first = await ops.saveDraftToStore.call(a.workspace, { listingId }, ui);
    expect(first).toMatchObject({ ok: true, value: { outcome: { state: "done" } } });
    const refs = (await A.storeProducts([listingId])).get(listingId)!;
    expect(refs.woo).toMatch(/^\d+$/);
    expect(refs.shopify).toMatch(/^gid:\/\/shopify\/Product\/\d+$/);
    const steps = await select<{ step: string; status: string }>(
      "SELECT step, status FROM job_steps WHERE target = ? AND step LIKE 'store:%' ORDER BY step",
      [listingId],
    );
    expect(steps).toEqual([
      { step: "store:shopify", status: "done" },
      { step: "store:woo", status: "done" },
    ]);
    expect((await A.getListing(listingId))!.status).toBe("in_store");

    const saves = vi.spyOn(mockShopify, "saveDraft");
    await ops.saveDraftToStore.call(a.workspace, { listingId }, ui);
    expect(saves).not.toHaveBeenCalled();
    // an update sends the edits to the same Shopify product
    await ops.saveDraftToStore.call(a.workspace, { listingId, update: true }, ui);
    expect(saves).toHaveBeenCalledTimes(1);
    expect(saves.mock.calls[0]![2]).toMatchObject({ productRef: refs.shopify, locationId: "gid://shopify/Location/1" });
    expect((await A.storeProducts([listingId])).get(listingId)).toEqual(refs);
    saves.mockRestore();
  });

  it("names the store that failed, in the seller's language, and keeps the other's draft", async () => {
    const fails = vi
      .spyOn(mockShopify, "saveDraft")
      .mockRejectedValue(new StepError("shopifyBusy", { permanent: true }));
    const r = await ops.saveDraftToStore.call(a.workspace, { listingId, update: true }, ui);
    fails.mockRestore();
    const outcome = (r as { value: { outcome: { state: string; error: string } } }).value.outcome;
    expect(outcome.state).toBe("failed");
    expect(errorText(outcome.error, "en")).toBe(
      "Shopify: Shopify is busy right now. Your listing is safe here; try again in a moment.",
    );
    expect(errorText(outcome.error, "bn")).toMatch(/^Shopify: Shopify এখন ব্যস্ত।/);
    const woo = await select<{ status: string }>(
      "SELECT status FROM job_steps WHERE target = ? AND step = 'store:woo'",
      [listingId],
    );
    expect(woo[0]!.status).toBe("done");
  });

  it("saves only where the seller asked, or where new drafts are switched on", async () => {
    const saves = vi.spyOn(mockShopify, "saveDraft");
    await ops.saveDraftToStore.call(a.workspace, { listingId, update: true, stores: ["woo"] }, ui);
    expect(saves).not.toHaveBeenCalled();
    saves.mockRestore();
    await A.setConnectionSettings("woo", { demo: true, saveDrafts: false });
    expect(await storeTargets(a.workspace)).toEqual(["shopify"]);
    await A.setConnectionSettings("woo", { demo: true, saveDrafts: true });
  });

  it("refreshes an expired token once, even for two saves at the same moment", async () => {
    await A.rotateCredentials("shopify", async () => ({
      save: encryptShopifyToken({
        accessToken: "old",
        scope: "write_products,read_locations,write_inventory",
        expiresAt: Date.now() - 1_000,
        refreshToken: "mock-refresh-1",
        refreshExpiresAt: Date.now() + 86_400_000,
      }),
      value: null,
    }));
    const refresh = vi.spyOn(mockShopify, "refresh");
    const ctx = { workspaceId: a.workspace.id, jobId: null, step: "store" };
    // resolveShopifyStore skips mock mode only in the store step; here it runs for real
    const [x, y] = await Promise.all([resolveShopifyStore(a.workspace, ctx), resolveShopifyStore(a.workspace, ctx)]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(x.store.accessToken).toBe(y.store.accessToken);
    expect(x.store.accessToken).not.toBe("old");
    refresh.mockRestore();
  });

  it("marks the connection broken when the refresh token is refused", async () => {
    await A.rotateCredentials("shopify", async () => ({
      save: encryptShopifyToken({
        accessToken: "old",
        scope: "",
        expiresAt: Date.now() - 1_000,
        refreshToken: "mock-revoked",
        refreshExpiresAt: null,
      }),
      value: null,
    }));
    await expect(
      resolveShopifyStore(a.workspace, { workspaceId: a.workspace.id, jobId: null, step: "store" }),
    ).rejects.toMatchObject({ key: "shopifyReconnect" });
    expect((await A.storeConnection("shopify"))!.status).toBe("broken");
  });

  const deliver = (topic: string, id: string, secret = appSecret()) => {
    const body = JSON.stringify({ shop_domain: shop });
    return webhook(
      new Request("http://test/api/shopify/webhooks", {
        method: "POST",
        body,
        headers: {
          "x-shopify-hmac-sha256": createHmac("sha256", secret).update(body).digest("base64"),
          "x-shopify-topic": topic,
          "x-shopify-shop-domain": shop,
          "x-shopify-webhook-id": id,
        },
      }),
    );
  };

  it("refuses an unsigned webhook", async () => {
    expect((await deliver("app/uninstalled", `w-${listingId}-0`, "wrong")).status).toBe(401);
    expect((await A.storeConnection("shopify"))!.status).not.toBe("disconnected");
  });

  it("disconnects on app/uninstalled, once per delivery", async () => {
    const id = `w-${listingId}-1`;
    expect((await deliver("app/uninstalled", id)).status).toBe(200);
    const row = await A.storeConnection("shopify");
    expect(row).toMatchObject({ status: "disconnected", credentials_enc: null });
    // a repeat delivery is answered without doing it again
    expect((await deliver("app/uninstalled", id)).status).toBe(200);
  });

  it("forgets the store and its products on shop/redact", async () => {
    expect((await deliver("shop/redact", `w-${listingId}-2`)).status).toBe(200);
    expect(await A.storeConnection("shopify")).toBeNull();
    expect((await A.storeProducts([listingId])).get(listingId)).toEqual({ woo: expect.any(String) });
  });
});
