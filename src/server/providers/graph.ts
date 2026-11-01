import "server-only";
import { createHmac } from "node:crypto";
import { fetch } from "undici";
import { env } from "@/server/env";
import { StepError } from "@/server/pipeline/run-step";
import type { StepErrorKey, TextParams } from "@/server/step-text";
import { logged } from "./log";
import type { CallContext } from "./types";

/**
 * Calls to Meta's Graph API for Facebook and Instagram, each logged in api_calls. The
 * token goes in a header, never the URL, and every call carries appsecret_proof, so a
 * token copied out of our server is useless without the app secret.
 */

/** A failed Graph call, worded for the seller; `code` is Meta's error code for the caller to tell apart. */
export class GraphError extends StepError {
  constructor(
    readonly status: number,
    readonly code: number,
    key: StepErrorKey,
    params?: TextParams,
  ) {
    super(key, { params });
  }
}

export type GraphParams = Record<string, string | number | boolean>;

export interface GraphCall {
  provider: "facebook" | "instagram";
  /** For the log: what was called, without ids. */
  endpoint: string;
  method: "GET" | "POST";
  /** A Graph path (`/me/accounts`) or a full https URL on a Facebook host. */
  path: string;
  params?: GraphParams;
  token?: string;
  /** Extra headers, e.g. rupload's file_url. */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const FACEBOOK_HOST = /^https:\/\/(graph|rupload)\.facebook\.com\//;

export const graphBase = () => `https://graph.facebook.com/${env().metaApp.graphVersion}`;

export function appSecretProof(token: string): string {
  return createHmac("sha256", env().metaApp.appSecret).update(token).digest("hex");
}

export async function graph<T>(ctx: CallContext, call: GraphCall): Promise<T> {
  return logged(
    ctx,
    { provider: call.provider, model: "graph-api", endpoint: call.endpoint, mode: "live" },
    () => send<T>(call),
    () => ({ summary: call.endpoint, costUsd: 0 }),
  );
}

async function send<T>(call: GraphCall): Promise<T> {
  const url = new URL(call.path.startsWith("https://") ? call.path : `${graphBase()}${call.path}`);
  if (!FACEBOOK_HOST.test(url.href)) throw new GraphError(0, 0, "metaProblem", { status: 0 });
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(call.params ?? {})) params.set(k, String(v));
  if (call.token && env().metaApp.appSecret) params.set("appsecret_proof", appSecretProof(call.token));

  const headers: Record<string, string> = { Accept: "application/json", ...call.headers };
  if (call.token) headers.Authorization = `OAuth ${call.token}`;
  let body: string | undefined;
  if (call.method === "GET") params.forEach((v, k) => url.searchParams.set(k, v));
  else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = params.toString();
  }

  let res;
  try {
    res = await fetch(url, {
      method: call.method,
      headers,
      body,
      signal: AbortSignal.timeout(call.timeoutMs ?? 30_000),
      redirect: "error",
    });
  } catch {
    throw new GraphError(0, 0, "metaNoAnswer");
  }
  const json = (await res.json().catch(() => null)) as
    (T & { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } }) | null;
  if (json?.error || !res.ok) throw graphError(res.status, json?.error);
  if (!json) throw new GraphError(res.status, 0, "metaProblem", { status: res.status });
  return json;
}

/**
 * Meta's error codes in words a seller can act on. 190 is a token that no longer works
 * (password changed, app removed); 10 and 200–299 a permission the seller didn't give;
 * 4, 17, 32 and 613 rate limits. Anything else keeps Meta's own message, cut short.
 */
export function graphError(
  status: number,
  e: { message?: string; code?: number; error_user_msg?: string } | undefined,
): GraphError {
  const code = e?.code ?? 0;
  if (code === 190 || status === 401) return new GraphError(status, code, "metaAuth");
  if (code === 10 || (code >= 200 && code < 300)) return new GraphError(status, code, "metaPermission");
  if ([4, 17, 32, 613].includes(code) || status === 429) return new GraphError(status, code, "metaBusy");
  const message = (e?.error_user_msg || e?.message || "").slice(0, 200);
  if (message) return new GraphError(status, code, "metaSaid", { message });
  return new GraphError(status, code, "metaProblem", { status });
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
