import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/server/env";
import { StepError } from "@/server/pipeline/run-step";
import { logged } from "../log";
import type { CallContext, WooStore } from "../types";

/**
 * Calls to one store's WooCommerce REST API (wc/v3), each logged in api_calls.
 *
 * WooCommerce takes the keys directly (Basic auth) only over HTTPS. Over plain HTTP it
 * wants OAuth 1.0a signed query strings, which only a local test store should ever
 * need, so plain HTTP is refused in production.
 */

/** A store answer that isn't a success. Its message quotes the store, so the seller may see it. */
export class WooHttpError extends StepError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Query = Record<string, string | number>;

/** OAuth 1.0a (one-legged, HMAC-SHA256) as WooCommerce checks it over plain HTTP. */
export function oauthQuery(method: string, url: string, query: Query, store: WooStore, now = Date.now()): string {
  const enc = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const params: Record<string, string> = {
    ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
    oauth_consumer_key: store.key,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: String(Math.floor(now / 1000)),
  };
  const normalised = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k]!)}`)
    .join("&");
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(normalised)}`;
  const signature = createHmac("sha256", `${store.secret}&`).update(base).digest("base64");
  return new URLSearchParams({ ...params, oauth_signature: signature }).toString();
}

export interface WooApi {
  get<T>(path: string, query?: Query): Promise<T>;
  post<T>(path: string, body: unknown, opts?: { timeoutMs?: number }): Promise<T>;
  put<T>(path: string, body: unknown, opts?: { timeoutMs?: number }): Promise<T>;
}

export function wooApi(ctx: CallContext, store: WooStore): WooApi {
  const https = store.url.startsWith("https://");
  if (!https && env().prod) throw new StepError("Your store address must start with https://.");

  const call = async <T>(method: string, path: string, query: Query, body: unknown, timeoutMs: number): Promise<T> =>
    logged(
      ctx,
      { provider: "woo", model: "woocommerce", endpoint: `${method} ${path.replace(/\/\d+/g, "/:id")}`, mode: "live" },
      async () => {
        const url = `${store.url}/wp-json/wc/v3/${path}`;
        const qs = https
          ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
          : oauthQuery(method, url, query, store);
        const headers: Record<string, string> = { Accept: "application/json" };
        if (https) headers.Authorization = `Basic ${Buffer.from(`${store.key}:${store.secret}`).toString("base64")}`;
        if (body !== undefined) headers["Content-Type"] = "application/json";
        let res: Response;
        try {
          res = await fetch(qs ? `${url}?${qs}` : url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
            redirect: "error",
          });
        } catch {
          throw new StepError("Your store didn't answer. Your listing is safe here; try again in a moment.");
        }
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!res.ok) throw httpError(res.status, data);
        return data as T;
      },
      () => ({ summary: `${method} ${path.split("?")[0]}`, costUsd: 0 }),
    );

  return {
    get: (path, query = {}) => call("GET", path, query, undefined, 20_000),
    post: (path, body, opts) => call("POST", path, {}, body, opts?.timeoutMs ?? 20_000),
    put: (path, body, opts) => call("PUT", path, {}, body, opts?.timeoutMs ?? 20_000),
  };
}

/** Store errors in words a seller can act on; WooCommerce's own message is kept for the rest. */
function httpError(status: number, data: Record<string, unknown> | null): Error {
  const code = typeof data?.code === "string" ? data.code : "";
  const message = typeof data?.message === "string" ? data.message : "";
  const extra = (data?.data as Record<string, unknown> | undefined) ?? {};
  if (status === 401 || status === 403)
    return new StepError("Your store didn't accept ListSnap's keys. Check them in Connections (read/write access).");
  if (status === 404 && code === "rest_no_route")
    return new StepError("ListSnap couldn't find WooCommerce at your store address. Check it in Connections.");
  if (status >= 500) return new StepError(`Your store had a problem (error ${status}). Your listing is safe here.`);
  // WooCommerce quotes the image link here, which must not reach the seller or the log
  if (code === "woocommerce_product_image_upload_error")
    return new WooHttpError(
      status,
      code,
      "Your store couldn't download the product photos. Check that it can reach ListSnap, then try again.",
    );
  return new WooHttpError(
    status,
    code,
    message ? `Your store said: ${message.slice(0, 200)}` : `Store error ${status}`,
    extra,
  );
}
