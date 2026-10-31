import "server-only";
import { fetch, type Response } from "undici";
import { env } from "@/server/env";
import { StepError } from "@/server/pipeline/run-step";
import type { StepErrorKey, TextParams } from "@/server/step-text";
import { SHOP_DOMAIN } from "@/lib/shopify-connection";
import { logged } from "../log";
import type { CallContext, ShopifyStore } from "../types";

/**
 * Calls to one store's GraphQL Admin API, each logged in api_calls. The store address
 * is always checked against Shopify's own myshopify.com pattern first, so a seller's
 * input can never point our server anywhere else.
 */

/**
 * A failed Shopify call, worded for the seller. `status` is the HTTP status (0 when
 * Shopify never answered) and `code` Shopify's error code, so the connection check can
 * tell a revoked token from a store that's down.
 */
export class ShopifyHttpError extends StepError {
  constructor(
    readonly status: number,
    readonly code: string,
    key: StepErrorKey,
    params?: TextParams,
  ) {
    super(key, { params });
  }
}

export interface ShopifyApi {
  /** One query or mutation. GraphQL errors throw; a mutation's userErrors are the caller's to read. */
  gql<T>(name: string, query: string, variables?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T>;
}

// Shopify's cost bucket refills in about a second; three tries cover a busy moment
const THROTTLE_TRIES = 3;
const THROTTLE_WAIT_MS = 1_000;

export function assertShop(shop: string): void {
  if (!SHOP_DOMAIN.test(shop)) throw new ShopifyHttpError(0, "shop", "shopifyGone");
}

export function shopifyApi(ctx: CallContext, store: ShopifyStore, sleep = wait): ShopifyApi {
  assertShop(store.shop);
  const url = `https://${store.shop}/admin/api/${env().shopify.apiVersion}/graphql.json`;

  const once = async <T>(query: string, variables: Record<string, unknown>, timeoutMs: number) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Access-Token": store.accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch {
      throw new ShopifyHttpError(0, "unreachable", "shopifyNoAnswer");
    }
    const body = (await res.json().catch(() => null)) as {
      data?: T;
      errors?: { message?: string; extensions?: { code?: string } }[] | string;
    } | null;
    if (!res.ok) throw httpError(res.status, body?.errors);
    const errors = Array.isArray(body?.errors) ? body.errors : [];
    if (errors.some((e) => e.extensions?.code === "THROTTLED")) return { throttled: true as const };
    if (errors.length) {
      const first = errors[0]!;
      if (first.extensions?.code === "ACCESS_DENIED") throw new ShopifyHttpError(403, "ACCESS_DENIED", "shopifyAuth");
      throw new ShopifyHttpError(200, first.extensions?.code ?? "graphql", "shopifySaid", {
        message: (first.message ?? "").slice(0, 200),
      });
    }
    if (!body?.data) throw new ShopifyHttpError(res.status, "empty", "shopifyProblem", { status: res.status });
    return { data: body.data };
  };

  return {
    gql: (name, query, variables = {}, opts) =>
      logged(
        ctx,
        { provider: "shopify", model: "shopify-admin", endpoint: name, mode: "live" },
        async () => {
          for (let i = 0; ; i++) {
            const r = await once<never>(query, variables, opts?.timeoutMs ?? 20_000);
            if (!("throttled" in r)) return r.data;
            if (i + 1 >= THROTTLE_TRIES) throw new ShopifyHttpError(429, "THROTTLED", "shopifyBusy");
            await sleep(THROTTLE_WAIT_MS);
          }
        },
        () => ({ summary: name, costUsd: 0 }),
      ),
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Status codes in words a seller can act on. Shopify's own text is kept only for GraphQL errors. */
function httpError(status: number, errors: unknown): ShopifyHttpError {
  const code = typeof errors === "string" ? errors.slice(0, 64) : "";
  if (status === 401 || status === 403) return new ShopifyHttpError(status, code, "shopifyAuth");
  // 402: the store is frozen for unpaid bills; 423: it's locked; 404: no such store
  if (status === 402 || status === 423) return new ShopifyHttpError(status, code, "shopifyUnavailable");
  if (status === 404) return new ShopifyHttpError(status, code, "shopifyGone");
  if (status === 429) return new ShopifyHttpError(status, code, "shopifyBusy");
  return new ShopifyHttpError(status, code, "shopifyProblem", { status });
}

/** A mutation's userErrors as one seller-facing error; Shopify's words are kept, cut short. */
export function userErrorsToStepError(errors: { field?: string[] | null; message: string }[]): ShopifyHttpError {
  return new ShopifyHttpError(200, "userErrors", "shopifySaid", {
    message: errors
      .map((e) => e.message)
      .join(" ")
      .slice(0, 200),
  });
}
