import "server-only";
import { randomUUID } from "node:crypto";
import { logged } from "../log";
import type { ShopifyCheckResult } from "@/lib/shopify-connection";
import type { CallContext, ShopifyProvider, ShopifyToken } from "../types";
import { ShopifyHttpError } from "./http";
import { editUrl } from "./draft";

/**
 * Pretends to be Shopify: stable product GIDs and tokens that expire like real ones,
 * nothing leaves the server. A store named "noscopes-…" fails the scope check, and the
 * refresh token "mock-revoked" is refused, so both paths can be tried without Shopify.
 */
let nextId = 9000;
const HOUR = 3_600_000;

const token = (): ShopifyToken => ({
  accessToken: `mock-access-${randomUUID()}`,
  scope: "write_products,read_locations,write_inventory",
  expiresAt: Date.now() + HOUR,
  refreshToken: `mock-refresh-${randomUUID()}`,
  refreshExpiresAt: Date.now() + 90 * 24 * HOUR,
});

const tokenCall = (ctx: CallContext, grant: string, fn: () => ShopifyToken) =>
  logged(
    ctx,
    {
      provider: "shopify",
      model: "shopify-oauth (mock)",
      endpoint: `POST oauth/access_token (${grant})`,
      mode: "mock",
    },
    async () => fn(),
    () => ({ summary: "token ok, expiring", costUsd: 0 }),
  );

export const mockShopify: ShopifyProvider = {
  mode: "mock",

  saveDraft: (ctx, store, input) =>
    logged(
      ctx,
      { provider: "shopify", model: "shopify-admin (mock)", endpoint: "productSet", mode: "mock" },
      async () => {
        const productRef = input.productRef ?? `gid://shopify/Product/${nextId++}`;
        return { productRef, editUrl: editUrl(store?.shop ?? "listsnap-demo.myshopify.com", productRef) };
      },
      (r) => ({
        summary: `draft ${r.productRef.split("/").pop()} "${input.title}"${input.variants ? ` · ${input.variants.length} colours` : ""}`,
        costUsd: 0,
      }),
    ),

  check: (ctx, store) =>
    logged(
      ctx,
      { provider: "shopify", model: "shopify-admin (mock)", endpoint: "check", mode: "mock" },
      async (): Promise<ShopifyCheckResult> => {
        const scopesOk = !store.shop.startsWith("noscopes-");
        return {
          ok: scopesOk,
          checks: [
            { id: "reach", status: "pass" },
            scopesOk ? { id: "scopes", status: "pass" } : { id: "scopes", status: "fail", reason: "scopes" },
            { id: "location", status: "pass" },
            { id: "currency", status: "pass" },
          ],
          shopName: store.shop.replace(/\.myshopify\.com$/, ""),
          currency: "BDT",
          locations: [
            { id: "gid://shopify/Location/1", name: "Shop floor" },
            { id: "gid://shopify/Location/2", name: "Warehouse" },
          ],
        };
      },
      (r) => ({ summary: r.ok ? "connection ok" : "connection failed", costUsd: 0 }),
    ),

  exchangeCode: (ctx) => tokenCall(ctx, "authorization_code", token),

  refresh: (ctx, _shop, refreshToken) =>
    tokenCall(ctx, "refresh_token", () => {
      if (refreshToken === "mock-revoked") throw new ShopifyHttpError(400, "invalid_grant", "shopifyReconnect");
      return token();
    }),

  appToken: (ctx) =>
    tokenCall(ctx, "client_credentials", () => ({
      ...token(),
      expiresAt: Date.now() + 24 * HOUR,
      refreshToken: null,
      refreshExpiresAt: null,
    })),
};
