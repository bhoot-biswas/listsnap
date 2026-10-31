import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import { forWorkspace } from "@/server/db/scope";
import { shopify } from "@/server/providers";
import { callbackHmac, hasScopes, installUrl } from "@/server/providers/shopify/oauth";
import { ShopifySettings, type ShopifyCheckResult } from "@/lib/shopify-connection";
import { encryptShopifyToken, shopBaseUrl } from "./shopify-store";

/**
 * Connecting a Shopify store with OAuth. The install link carries a random state; the
 * same state, the shop and the workspace go into a short-lived signed cookie, so the
 * callback only finishes an install this browser started for this shop.
 */

export const STATE_COOKIE = "listsnap_shopify_oauth";
const STATE_TTL_MS = 10 * 60_000;

const State = z.object({
  state: z.string().min(16),
  workspaceId: z.string(),
  shop: z.string(),
  next: z.enum(["onboarding", "connections"]),
  exp: z.number(),
});
type State = z.infer<typeof State>;

const sign = (body: string) =>
  createHmac("sha256", `${env().authSecret}:shopify-oauth`).update(body).digest("base64url");

export function stateCookie(s: Omit<State, "state" | "exp">): { value: string; state: string } {
  const state = randomBytes(24).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...s, state, exp: Date.now() + STATE_TTL_MS })).toString("base64url");
  return { value: `${body}.${sign(body)}`, state };
}

export function readStateCookie(value: string | undefined): State | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = State.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** The app secret that signs callbacks and webhooks; the mock has a fixed one so its flow can be tried. */
export const appSecret = () => env().shopify.clientSecret || (shopify().mode === "mock" ? "mock-shopify-secret" : "");

/**
 * Shopify is offered only where connecting really works: live with the app's keys, or
 * outside production, where the mock lets the whole flow be tried. A production site
 * still on the mock would let sellers "connect" a store that saves nowhere.
 */
export const shopifyOffered = () =>
  !env().prod || (shopify().mode === "live" && !!env().shopify.clientId && !!appSecret());

export const redirectUri = () => `${env().siteUrl}/api/shopify/callback`;

/**
 * Where the seller goes to approve ListSnap. In mock mode there is no Shopify to ask, so
 * the link goes straight to our own callback, signed as Shopify would sign it.
 */
export function authorizeUrl(shop: string, state: string): string {
  if (shopify().mode === "mock") {
    const q = new URLSearchParams({ code: "mock-code", shop, state, timestamp: String(Math.floor(Date.now() / 1000)) });
    q.set("hmac", callbackHmac(q, appSecret()));
    return `${redirectUri()}?${q}`;
  }
  return installUrl({ shop, clientId: env().shopify.clientId, redirectUri: redirectUri(), state });
}

export type ConnectError = "scopes" | "taken" | "failed";

/** Exchanges the code, checks the store, and saves the connection. Returns why not, when it can't. */
export async function finishInstall(workspaceId: string, shop: string, code: string): Promise<ConnectError | null> {
  const ws = forWorkspace(workspaceId);
  const ctx = { workspaceId, jobId: null, step: "connect" };
  // two shops on one store would each hold a token the other's reconnect could undo
  if (await ws.otherShopWithStore("shopify", shopBaseUrl(shop))) return "taken";
  const token = await shopify().exchangeCode(ctx, shop, code);
  if (!hasScopes(token.scope)) return "scopes";
  const result = await shopify().check(ctx, { shop, accessToken: token.accessToken });
  const previous = ShopifySettings.parse((await ws.storeConnection("shopify"))?.settings_json ?? {});
  await ws.saveConnection("shopify", {
    baseUrl: shopBaseUrl(shop),
    credentialsEnc: encryptShopifyToken(token),
    checks: result.checks,
    settings: settingsAfterCheck(result, { ...previous, demo: false }),
  });
  if (!result.ok) await ws.setConnectionChecks("shopify", "broken", result.checks);
  return null;
}

/** Keeps the seller's chosen location while it still exists; otherwise the first one. */
export function settingsAfterCheck(result: ShopifyCheckResult, settings: ShopifySettings): ShopifySettings {
  const chosen = result.locations.find((l) => l.id === settings.locationId) ?? result.locations[0] ?? null;
  return {
    ...settings,
    shopName: result.shopName ?? settings.shopName,
    locationId: chosen?.id ?? null,
    locationName: chosen?.name ?? null,
    locations: result.locations,
  };
}
