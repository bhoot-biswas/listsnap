import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fetch } from "undici";
import { logged } from "../log";
import type { CallContext, ShopifyToken } from "../types";
import { ShopifyHttpError, assertShop } from "./http";

/**
 * Shopify's OAuth (authorization code grant, with expiring offline tokens) and the
 * signatures it puts on callbacks and webhooks. One list of scopes is used for the
 * install link, the check after connecting and shopify.app.toml.
 */

/** write_* includes read_*. Inventory, because sellers' stock counts are tracked in Shopify. */
export const SHOPIFY_SCOPES = ["write_products", "read_locations", "write_inventory"] as const;

/** Whether a granted scope string ("write_products,read_locations") covers ours. */
export function hasScopes(granted: string): boolean {
  const have = new Set(granted.split(",").map((s) => s.trim()));
  return SHOPIFY_SCOPES.every((s) => have.has(s) || (s.startsWith("read_") && have.has(`write_${s.slice(5)}`)));
}

export function installUrl(o: { shop: string; clientId: string; redirectUri: string; state: string }): string {
  assertShop(o.shop);
  const q = new URLSearchParams({
    client_id: o.clientId,
    scope: SHOPIFY_SCOPES.join(","),
    redirect_uri: o.redirectUri,
    state: o.state,
  });
  return `https://${o.shop}/admin/oauth/authorize?${q}`;
}

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * The hmac Shopify adds to the callback and to links from the Shopify admin: every
 * other query parameter, sorted, as key=value joined by &, signed with our secret (hex).
 */
export function callbackHmac(params: URLSearchParams, secret: string): string {
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function verifyCallbackHmac(params: URLSearchParams, secret: string): boolean {
  const given = params.get("hmac");
  return !!given && !!secret && sameText(callbackHmac(params, secret), given);
}

/** Webhooks: base64 HMAC-SHA256 of the raw body, in X-Shopify-Hmac-Sha256. */
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  return sameText(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"), header);
}

const TokenAnswer = (raw: Record<string, unknown>, now: number): ShopifyToken => {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (typeof raw.access_token !== "string" || !raw.access_token)
    throw new ShopifyHttpError(200, "no_token", "shopifyAuth");
  const expiresIn = n(raw.expires_in);
  const refreshIn = n(raw.refresh_token_expires_in);
  return {
    accessToken: raw.access_token,
    scope: typeof raw.scope === "string" ? raw.scope : "",
    expiresAt: expiresIn === null ? null : now + expiresIn * 1000,
    refreshToken: typeof raw.refresh_token === "string" ? raw.refresh_token : null,
    refreshExpiresAt: refreshIn === null ? null : now + refreshIn * 1000,
  };
};

/** One POST to the store's token endpoint; what's sent and received never reaches the log. */
export function tokenRequest(
  ctx: CallContext,
  shop: string,
  grant: string,
  form: Record<string, string>,
): Promise<ShopifyToken> {
  assertShop(shop);
  return logged(
    ctx,
    { provider: "shopify", model: "shopify-oauth", endpoint: `POST oauth/access_token (${grant})`, mode: "live" },
    async () => {
      let res;
      try {
        res = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams(form).toString(),
          signal: AbortSignal.timeout(20_000),
          redirect: "error",
        });
      } catch {
        throw new ShopifyHttpError(0, "unreachable", "shopifyNoAnswer");
      }
      const body = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      if (res.ok) return TokenAnswer(body, Date.now());
      // a used, revoked or expired refresh token: only connecting again helps
      if (res.status === 400 || res.status === 401 || res.status === 403)
        throw new ShopifyHttpError(res.status, String(body.error ?? ""), "shopifyReconnect");
      throw new ShopifyHttpError(res.status, String(body.error ?? ""), "shopifyProblem", { status: res.status });
    },
    (t) => ({ summary: `token ok${t.expiresAt ? ", expiring" : ""}`, costUsd: 0 }),
  );
}
