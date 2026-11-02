import "server-only";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { env } from "@/server/env";
import { forWorkspace } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { shopify, type CallContext, type ShopifyStore } from "@/server/providers";
import type { ShopifyToken } from "@/server/providers/types";
import { StepError } from "@/server/pipeline/run-step";
import { ShopifySettings } from "@/lib/shopify-connection";

/**
 * Which Shopify store a shop saves to, with a token that works now. Shopify's offline
 * tokens expire after about an hour and each refresh spends the refresh token, so two
 * saves must never refresh at once. In this process, saves that need a refresh share one
 * (they wait on it without holding a database connection: a row lock held across the
 * call to Shopify once stalled every request in the app). The new token is saved only if
 * the old one is still there, so another process that refreshed first wins and its token
 * is used.
 */

const Token = z.object({
  accessToken: z.string().min(1),
  scope: z.string(),
  expiresAt: z.number().nullable(),
  refreshToken: z.string().nullable(),
  refreshExpiresAt: z.number().nullable(),
});

// refresh a little early, so a token never expires halfway through a save
const EARLY_MS = 5 * 60_000;

export const encryptShopifyToken = (t: ShopifyToken) => encryptSecret(JSON.stringify(Token.parse(t)));

const readToken = (enc: string | null) => (enc ? Token.parse(JSON.parse(decryptSecret(enc))) : null);
const stale = (t: ShopifyToken, now = Date.now()) => t.expiresAt !== null && t.expiresAt - now < EARLY_MS;

/** "https://name.myshopify.com" as saved in base_url → "name.myshopify.com". */
export const shopOf = (baseUrl: string) => new URL(baseUrl).host;
export const shopBaseUrl = (shop: string) => `https://${shop}`;

let demoToken: ShopifyToken | null = null;

/** The refresh in flight for each shop, which every save that needs one waits on. */
const refreshing = new Map<string, Promise<string>>();

/** Our own demo store: its app's keys get a 24-hour token, kept in memory until it's nearly up. */
export async function demoShopifyStore(ctx: CallContext): Promise<ShopifyStore> {
  const demo = env().demoShopify;
  if (!demo) {
    if (shopify().mode === "mock") return { shop: "listsnap-demo.myshopify.com", accessToken: "mock" };
    throw new StepError("demoStoreMissing");
  }
  if (!demoToken || stale(demoToken)) demoToken = await shopify().appToken(ctx, demo.shop, demo);
  return { shop: demo.shop, accessToken: demoToken.accessToken };
}

/** One refresh of a shop's token, read fresh in case another save or process just did it. */
async function refreshToken(workspace: Workspace, shop: string, ctx: CallContext): Promise<string> {
  const ws = forWorkspace(workspace.id);
  const enc = (await ws.storeConnection("shopify"))?.credentials_enc ?? null;
  const now = readToken(enc);
  if (!enc || !now) throw new StepError("connectStore");
  if (!stale(now)) return now.accessToken;
  if (!now.refreshToken) throw new StepError("shopifyReconnect");
  let fresh: ShopifyToken;
  try {
    fresh = await shopify().refresh(ctx, shop, now.refreshToken);
  } catch (err) {
    // another process spent the refresh token first: its new token is the one to use
    const theirs = readToken((await ws.storeConnection("shopify"))?.credentials_enc ?? null);
    if (theirs && !stale(theirs)) return theirs.accessToken;
    throw err;
  }
  if (await ws.swapCredentials("shopify", enc, encryptShopifyToken(fresh))) return fresh.accessToken;
  const theirs = readToken((await ws.storeConnection("shopify"))?.credentials_enc ?? null);
  return theirs && !stale(theirs) ? theirs.accessToken : fresh.accessToken;
}

export async function shopifySettings(workspace: Workspace): Promise<ShopifySettings> {
  const c = await forWorkspace(workspace.id).storeConnection("shopify");
  return ShopifySettings.parse(c?.settings_json ?? {});
}

/** The store to call and a fresh token. Throws a seller-facing error when there's none. */
export async function resolveShopifyStore(
  workspace: Workspace,
  ctx: CallContext,
): Promise<{ store: ShopifyStore; settings: ShopifySettings }> {
  const ws = forWorkspace(workspace.id);
  const c = await ws.storeConnection("shopify");
  if (!c || c.status === "disconnected") throw new StepError("connectStore");
  const settings = ShopifySettings.parse(c.settings_json ?? {});
  if (settings.demo) return { store: await demoShopifyStore(ctx), settings };
  if (!c.base_url || !c.credentials_enc) throw new StepError("connectStore");
  const shop = shopOf(c.base_url);

  const saved = readToken(c.credentials_enc);
  if (saved && !stale(saved)) return { store: { shop, accessToken: saved.accessToken }, settings };
  try {
    let refresh = refreshing.get(workspace.id);
    if (!refresh) {
      refresh = refreshToken(workspace, shop, ctx).finally(() => refreshing.delete(workspace.id));
      refreshing.set(workspace.id, refresh);
    }
    return { store: { shop, accessToken: await refresh }, settings };
  } catch (err) {
    // only connecting again helps; the Connections page and dashboard say so
    if (err instanceof StepError && err.key === "shopifyReconnect")
      await ws.setConnectionChecks("shopify", "broken", [{ id: "reach", status: "fail", reason: "auth" }]);
    throw err;
  }
}
