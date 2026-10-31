import "server-only";
import { env } from "@/server/env";
import { demoIpLimit } from "@/server/db/limits";
import type { WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { fail } from "@/server/http";

/**
 * Reserves today's slot for one new listing before its photo is processed. A demo shop
 * also takes a slot from the visitor's own daily count, so opening another demo shop
 * doesn't reset the limit. Returns a release for when the photo never becomes a job.
 */
export async function reserveListingSlot(
  ws: WorkspaceScope,
  workspace: Workspace,
  request: Request,
): Promise<{ ok: true; release: () => Promise<void> } | { ok: false; response: Response }> {
  const release = await takeListingSlot(ws, workspace, clientIp(request));
  return release ? { ok: true, release } : { ok: false, response: await limitReached() };
}

/**
 * The visitor's address as Nginx saw it. In a list (X-Forwarded-For) only the last entry was
 * added by Nginx; the ones before it came from the visitor and can say anything.
 */
export const clientIp = (request: Request): string =>
  request.headers.get(env().ipHeader)?.split(",").at(-1)?.trim() || "unknown";

/** The same slot for callers without a request, such as a chat tool; null at the limit. */
export async function takeListingSlot(
  ws: WorkspaceScope,
  workspace: Workspace,
  ip: string,
): Promise<(() => Promise<void>) | null> {
  if (!(await ws.reserveListing(workspace.limits.listings))) return null;
  if (!workspace.isDemo) return () => ws.releaseListing();

  const ipHash = demoIpLimit.hash(ip, env().authSecret);
  if (!(await demoIpLimit.reserve(ipHash))) {
    await ws.releaseListing();
    return null;
  }
  return async () => {
    await ws.releaseListing();
    await demoIpLimit.release(ipHash);
  };
}

/** The page shows its own translated card for this code; the message is the fallback. */
export const limitReached = () => fail(429, "limit_reached", "listingLimit");
