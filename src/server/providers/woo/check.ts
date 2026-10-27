import "server-only";
import { env } from "@/server/env";
import type { WooCheck, WooCheckReason, WooCheckResult } from "@/lib/woo-connection";
import type { CallContext, WooStore } from "../types";
import { WooHttpError, wooApi } from "./http";

/**
 * The connection test behind the onboarding and Connections forms. It reads, then
 * proves write access with an empty batch request: WooCommerce turns read-only keys
 * away at the door for any POST, and an empty batch changes nothing in the store.
 */

const reasonFor = (err: unknown): WooCheckReason => {
  if (!(err instanceof WooHttpError)) return "server";
  if (err.code === "http" || err.code === "private" || err.code === "unreachable" || err.code === "not_woo")
    return err.code;
  if (err.status === 401 || err.status === 403) return "keys";
  return "server";
};

export async function checkWooStore(ctx: CallContext, store: WooStore): Promise<WooCheckResult> {
  const checks: WooCheck[] = [];
  const done = (categories: WooCheckResult["categories"] = []): WooCheckResult => ({
    ok: checks.every((c) => c.status !== "fail"),
    checks,
    categories,
  });

  const https = store.url.startsWith("https://");
  // a plain-HTTP local test store is fine while developing; production refuses it
  checks.push(
    https ? { id: "https", status: "pass" } : { id: "https", status: env().prod ? "fail" : "warn", reason: "http" },
  );
  if (!https && env().prod) return done();

  const api = wooApi(ctx, store);
  let categories: WooCheckResult["categories"];
  try {
    const found = await api.get<{ id: number; name: string }[]>("products/categories", {
      per_page: 100,
      orderby: "name",
      hide_empty: "false",
    });
    categories = found.map((c) => ({ id: c.id, name: decodeEntities(c.name) }));
    checks.push({ id: "reach", status: "pass" }, { id: "read", status: "pass" });
  } catch (err) {
    const reason = reasonFor(err);
    if (reason === "keys") checks.push({ id: "reach", status: "pass" }, { id: "read", status: "fail", reason });
    else checks.push({ id: "reach", status: "fail", reason });
    return done();
  }

  try {
    await api.post("products/batch", {});
    checks.push({ id: "write", status: "pass" });
  } catch (err) {
    const reason = reasonFor(err);
    checks.push({ id: "write", status: "fail", reason: reason === "keys" ? "read_only" : reason });
    return done(categories);
  }

  try {
    const attributes = await api.get<{ name: string }[]>("products/attributes");
    const hasColor = attributes.some((a) => /^colou?r$/i.test(a.name.trim()));
    checks.push({ id: "color", status: hasColor ? "pass" : "warn" });
  } catch {
    checks.push({ id: "color", status: "warn" });
  }
  return done(categories);
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
