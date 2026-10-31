import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopifyDraftInput } from "../types";

/**
 * The live client against a fake Shopify: what it sends, in what order, and how
 * Shopify's answers (throttling, userErrors, a revoked token) reach the seller.
 */

const calls: { url: string; body: unknown }[] = [];
let answers: ((body: { query?: string; variables?: Record<string, unknown> }) => Response)[] = [];

vi.mock("undici", () => ({
  fetch: vi.fn(async (url: string, init: { body: string }) => {
    const body = init.body.startsWith("{") ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ url, body });
    const next = answers.shift();
    if (!next) throw new Error(`no answer queued for ${url}`);
    return next(body);
  }),
}));
vi.mock("../log", () => ({ logged: (_ctx: unknown, _info: unknown, fn: () => unknown) => fn() }));
vi.mock("@/server/media/store", () => ({ readMedia: async () => ({ mime: "image/jpeg" }) }));
vi.mock("@/server/media/signed", () => ({ signedMediaUrl: (_w: string, id: string) => `https://app/media/${id}.jpg` }));

process.env.SHOPIFY_CLIENT_ID = "client";
process.env.SHOPIFY_CLIENT_SECRET = "secret";

const { liveShopify } = await import("./live");

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const ctx = { workspaceId: "w", jobId: null, step: "store" };
const store = { shop: "rupkotha.myshopify.com", accessToken: "tok" };
const input: ShopifyDraftInput = {
  listingId: "L1",
  productRef: null,
  title: "Red saree",
  description: "Soft.",
  shortDescription: "Red.",
  category: "Sarees",
  regularPrice: 1500,
  stockQty: null,
  tags: [],
  attributes: [],
  images: [{ mediaId: "m1", alt: "Red saree" }],
  variants: null,
  locationId: null,
};

beforeEach(() => {
  calls.length = 0;
  answers = [];
});

describe("saveDraft", () => {
  it("looks for a lost earlier save, creates the draft, then records which photo is ours", async () => {
    answers = [
      () => json({ data: { products: { nodes: [] } } }),
      () => json({ data: { products: { nodes: [] } } }),
      () =>
        json({
          data: {
            productSet: {
              product: { id: "gid://shopify/Product/42", media: { nodes: [{ id: "M-9" }] } },
              userErrors: [],
            },
          },
        }),
      () => json({ data: { metafieldsSet: { userErrors: [] } } }),
    ];
    const saved = await liveShopify.saveDraft(ctx, store, input);
    expect(saved).toEqual({
      productRef: "gid://shopify/Product/42",
      editUrl: "https://admin.shopify.com/store/rupkotha/products/42",
    });
    expect(calls.map((c) => c.url)).toEqual(
      Array(4).fill("https://rupkotha.myshopify.com/admin/api/2026-10/graphql.json"),
    );
    const [bySku, byTitle, set, meta] = calls.map(
      (c) => c.body as { query: string; variables: Record<string, unknown> },
    );
    expect(bySku!.variables.q).toBe('sku:"listsnap-L1"');
    expect(byTitle!.variables.q).toBe('title:"Red saree"');
    expect(set!.variables.identifier).toBeNull();
    expect(set!.variables.input).toMatchObject({ status: "DRAFT", files: [{ filename: "listsnap-m1.jpg" }] });
    expect(meta!.variables.metafields).toEqual([
      { ownerId: "gid://shopify/Product/42", namespace: "listsnap", key: "media", type: "json", value: '{"m1":"M-9"}' },
    ]);
  });

  it("updates the saved product by its id", async () => {
    answers = [
      () =>
        json({
          data: {
            product: {
              id: "gid://shopify/Product/42",
              status: "ACTIVE",
              options: [{ name: "Title", optionValues: [{ name: "Default Title" }] }],
              variants: {
                nodes: [
                  {
                    id: "V1",
                    price: "1",
                    selectedOptions: [{ name: "Title", value: "Default Title" }],
                    itemId: { value: "listing" },
                  },
                ],
              },
              media: { nodes: [{ id: "M-9" }] },
              listingId: { value: "L1" },
              mediaMap: { value: '{"m1":"M-9"}' },
            },
          },
        }),
      () =>
        json({
          data: {
            productSet: {
              product: { id: "gid://shopify/Product/42", media: { nodes: [{ id: "M-9" }] } },
              userErrors: [],
            },
          },
        }),
      () => json({ data: { metafieldsSet: { userErrors: [] } } }),
    ];
    await liveShopify.saveDraft(ctx, store, { ...input, productRef: "gid://shopify/Product/42" });
    const set = calls[1]!.body as { variables: { identifier: unknown; input: Record<string, unknown> } };
    expect(set.variables.identifier).toEqual({ id: "gid://shopify/Product/42" });
    expect(set.variables.input).not.toHaveProperty("status");
    expect(set.variables.input.files).toEqual([{ id: "M-9" }]);
  });

  it("waits and tries again when Shopify is throttling", async () => {
    vi.useFakeTimers();
    try {
      answers = [
        () => json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }),
        () => json({ data: { product: null } }),
        () => json({ data: { products: { nodes: [] } } }),
      ];
      const pending = liveShopify
        .saveDraft(ctx, store, { ...input, productRef: "gid://shopify/Product/1" })
        .catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.runAllTimersAsync();
      await pending;
      // the product query ran twice: once throttled, once answered
      expect((calls[0]!.body as { query: string }).query).toBe((calls[1]!.body as { query: string }).query);
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts Shopify's userErrors in the seller's error", async () => {
    answers = [
      () => json({ data: { products: { nodes: [] } } }),
      () => json({ data: { products: { nodes: [] } } }),
      () =>
        json({
          data: { productSet: { product: null, userErrors: [{ field: ["title"], message: "Title is too long" }] } },
        }),
    ];
    await expect(liveShopify.saveDraft(ctx, store, input)).rejects.toMatchObject({
      key: "shopifySaid",
      params: { message: "Title is too long" },
    });
  });

  it("asks the seller to reconnect when the token is refused", async () => {
    answers = [() => json({ errors: "[API] Invalid API key or access token" }, 401)];
    await expect(liveShopify.saveDraft(ctx, store, input)).rejects.toMatchObject({ key: "shopifyAuth" });
  });

  it("never calls a store outside myshopify.com", async () => {
    await expect(
      liveShopify.saveDraft(ctx, { shop: "rupkotha.myshopify.com.evil.example", accessToken: "t" }, input),
    ).rejects.toMatchObject({ key: "shopifyGone" });
    expect(calls).toEqual([]);
  });
});

describe("check", () => {
  it("passes a store with our scopes and a location, and warns on another currency", async () => {
    answers = [
      () =>
        json({
          data: {
            shop: { name: "Rupkotha", currencyCode: "USD" },
            locations: {
              nodes: [
                { id: "L-1", name: "Shop", isActive: true },
                { id: "L-2", name: "Old", isActive: false },
              ],
            },
            currentAppInstallation: {
              accessScopes: [{ handle: "write_products" }, { handle: "read_locations" }, { handle: "write_inventory" }],
            },
          },
        }),
    ];
    const r = await liveShopify.check(ctx, store);
    expect(r).toMatchObject({
      ok: true,
      shopName: "Rupkotha",
      currency: "USD",
      locations: [{ id: "L-1", name: "Shop" }],
    });
    expect(r.checks).toEqual([
      { id: "reach", status: "pass" },
      { id: "scopes", status: "pass" },
      { id: "location", status: "pass" },
      { id: "currency", status: "warn", reason: "currency" },
    ]);
  });

  it("fails on a refused token", async () => {
    answers = [() => json({ errors: "Unauthorized" }, 401)];
    const r = await liveShopify.check(ctx, store);
    expect(r.ok).toBe(false);
    expect(r.checks).toEqual([{ id: "reach", status: "fail", reason: "auth" }]);
  });
});

describe("tokens", () => {
  it("asks for an expiring offline token and keeps both expiry times", async () => {
    answers = [
      () =>
        json({
          access_token: "shpat_x",
          scope: "write_products,read_locations,write_inventory",
          expires_in: 3600,
          refresh_token: "shprt_y",
          refresh_token_expires_in: 7_776_000,
        }),
    ];
    const before = Date.now();
    const t = await liveShopify.exchangeCode(ctx, store.shop, "the-code");
    expect(calls[0]).toEqual({
      url: "https://rupkotha.myshopify.com/admin/oauth/access_token",
      body: { client_id: "client", client_secret: "secret", code: "the-code", expiring: "1" },
    });
    expect(t.accessToken).toBe("shpat_x");
    expect(t.refreshToken).toBe("shprt_y");
    expect(t.expiresAt! - before).toBeGreaterThanOrEqual(3_600_000);
    expect(t.refreshExpiresAt! - before).toBeGreaterThanOrEqual(7_776_000_000);
  });

  it("turns a used refresh token into 'connect again'", async () => {
    answers = [() => json({ error: "invalid_grant" }, 400)];
    await expect(liveShopify.refresh(ctx, store.shop, "old")).rejects.toMatchObject({ key: "shopifyReconnect" });
    expect(calls[0]!.body).toMatchObject({ grant_type: "refresh_token", refresh_token: "old" });
  });
});
