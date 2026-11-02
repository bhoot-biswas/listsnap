import "server-only";
import type { WorkspaceScope } from "@/server/db/scope";
import { facebook } from "@/server/providers";
import { GraphError } from "@/server/providers/graph";
import { MetaSettings } from "@/lib/schemas/social";
import { metaConnection } from "./connection";

/**
 * Keeps the Facebook connection honest. The seller has two logins with Meta: the Page's,
 * which posts reels and lasts until they change their password or remove ListSnap, and
 * their own, which catalogs need and Meta ends after about 60 days. When Meta refuses
 * one, only that one is marked: a dead Page login makes the connection broken, a dead
 * catalog login counts as ended, which Connections, Review and Listings already explain.
 */

export type MetaLogin = "page" | "user";
export type MetaCheck = { id: MetaLogin; status: "pass" | "fail" };

export const metaRefusal = (err: unknown) => err instanceof GraphError && err.key === "metaAuth";

/** Meta refused one of the logins in a real call. */
export async function metaRefused(ws: WorkspaceScope, login: MetaLogin): Promise<void> {
  const row = await ws.storeConnection("meta");
  const settings = MetaSettings.safeParse(row?.settings_json);
  if (!row || row.status === "disconnected" || !settings.success || settings.data.test) return;
  const checks = withCheck(row.checks_json, { id: login, status: "fail" });
  if (login === "page") return ws.setConnectionChecks("meta", "broken", checks);
  await ws.setConnectionSettings("meta", { ...settings.data, userTokenExpiresAt: new Date().toISOString() });
  await ws.setConnectionChecks("meta", row.status === "broken" ? "broken" : "connected", checks);
}

/** A post went out, so the Page login works again. */
export async function metaPageWorks(ws: WorkspaceScope): Promise<void> {
  const row = await ws.storeConnection("meta");
  if (row?.status === "broken")
    await ws.setConnectionChecks("meta", "connected", withCheck(row.checks_json, { id: "page", status: "pass" }));
}

/**
 * "Test now": asks Meta about each login and records the answer. A catalog login Meta
 * refuses counts as ended; one it accepts keeps the date it was given at login.
 */
export async function recheckMetaLogins(ws: WorkspaceScope): Promise<void> {
  const conn = await metaConnection(ws);
  if (!conn || conn.settings.test) return;
  const ctx = { workspaceId: ws.id, jobId: null, step: "connect" };
  const page = conn.account("facebook")?.token;
  const user = conn.settings.catalogAccess ? conn.userToken() : null;
  const checks: MetaCheck[] = [
    { id: "page", status: page && (await facebook().checkToken(ctx, page)) === "ok" ? "pass" : "fail" },
  ];
  if (user) checks.push({ id: "user", status: (await facebook().checkToken(ctx, user)) === "ok" ? "pass" : "fail" });
  if (checks.some((c) => c.id === "user" && c.status === "fail"))
    await ws.setConnectionSettings("meta", { ...conn.settings, userTokenExpiresAt: new Date().toISOString() });
  await ws.setConnectionChecks("meta", checks[0]!.status === "pass" ? "connected" : "broken", checks);
}

export function metaChecks(json: unknown): MetaCheck[] {
  return (Array.isArray(json) ? json : []).filter(
    (c): c is MetaCheck => (c?.id === "page" || c?.id === "user") && (c.status === "pass" || c.status === "fail"),
  );
}

const withCheck = (json: unknown, check: MetaCheck) => [...metaChecks(json).filter((c) => c.id !== check.id), check];
