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
 * tokens expire after about an hour and each refresh spends the refresh token, so a
 * refresh happens with the connection's row held: a second save waiting on it then
 * finds the new token instead of spending the old refresh token again.
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
    const accessToken = await ws.rotateCredentials("shopify", async (enc) => {
      const now = readToken(enc);
      if (!now) throw new StepError("connectStore");
      // another save refreshed it while this one waited for the row
      if (!stale(now)) return { save: null, value: now.accessToken };
      if (!now.refreshToken) throw new StepError("shopifyReconnect");
      const fresh = await shopify().refresh(ctx, shop, now.refreshToken);
      return { save: encryptShopifyToken(fresh), value: fresh.accessToken };
    });
    return { store: { shop, accessToken }, settings };
  } catch (err) {
    // only connecting again helps; the Connections page and dashboard say so
    if (err instanceof StepError && err.key === "shopifyReconnect")
      await ws.setConnectionChecks("shopify", "broken", [{ id: "reach", status: "fail", reason: "auth" }]);
    throw err;
  }
}
