import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/server/env";
import { isPublicHost } from "@/server/net/public-host";
import { StepError } from "@/server/pipeline/run-step";
import type { StepErrorKey, TextParams } from "@/server/step-text";
import { logged } from "../log";
import type { CallContext, WooStore } from "../types";

/**
 * Calls to one store's WooCommerce REST API (wc/v3), each logged in api_calls.
 *
 * WooCommerce takes the keys directly (Basic auth) only over HTTPS. Over plain HTTP it
 * wants OAuth 1.0a signed query strings, which only a local test store should ever
 * need, so plain HTTP is refused in production.
 */

/**
 * A failed store call, worded for the seller. `status` is the HTTP status (0 when the
 * store never answered) and `code` WooCommerce's error code, so callers like the
 * connection check can tell wrong keys from read-only ones.
 */
export class WooHttpError extends StepError {
  constructor(
    readonly status: number,
    readonly code: string,
    key: StepErrorKey,
    params?: TextParams,
    readonly data: Record<string, unknown> = {},
  ) {
    super(key, { params });
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
  if (!https && env().prod) throw new WooHttpError(0, "http", "storeHttps");
  let publicCheck: Promise<boolean> | null = null;

  const call = async <T>(method: string, path: string, query: Query, body: unknown, timeoutMs: number): Promise<T> =>
    logged(
      ctx,
      { provider: "woo", model: "woocommerce", endpoint: `${method} ${path.replace(/\/\d+/g, "/:id")}`, mode: "live" },
      async () => {
        if (env().prod && !(await (publicCheck ??= isPublicHost(new URL(store.url).hostname))))
          throw new WooHttpError(0, "private", "storePrivate");
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
          throw new WooHttpError(0, "unreachable", "storeNoAnswer");
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
function httpError(status: number, data: Record<string, unknown> | null): WooHttpError {
  const code = typeof data?.code === "string" ? data.code : "";
  const message = typeof data?.message === "string" ? data.message : "";
  const extra = (data?.data as Record<string, unknown> | undefined) ?? {};
  if (status === 401 || status === 403) return new WooHttpError(status, code, "storeKeys");
  if (status === 404 && (code === "rest_no_route" || !data)) return new WooHttpError(status, "not_woo", "storeNotWoo");
  if (status >= 500) return new WooHttpError(status, code, "storeProblem", { status });
  // WooCommerce quotes the image link here, which must not reach the seller or the log
  if (code === "woocommerce_product_image_upload_error") return new WooHttpError(status, code, "storePhotos");
  return message
    ? new WooHttpError(status, code, "storeSaid", { message: message.slice(0, 200) }, extra)
    : new WooHttpError(status, code, "storeError", { status }, extra);
}
