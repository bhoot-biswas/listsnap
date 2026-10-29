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
  if (!(await ws.reserveListing(workspace.limits.listings))) return { ok: false, response: limitReached() };
  if (!workspace.isDemo) return { ok: true, release: () => ws.releaseListing() };

  const e = env();
  // the first address in the header is the visitor's; the rest are proxies
  const ip = request.headers.get(e.ipHeader)?.split(",")[0]?.trim() || "unknown";
  const ipHash = demoIpLimit.hash(ip, e.authSecret);
  if (!(await demoIpLimit.reserve(ipHash))) {
    await ws.releaseListing();
    return { ok: false, response: limitReached() };
  }
  return {
    ok: true,
    release: async () => {
      await ws.releaseListing();
      await demoIpLimit.release(ipHash);
    },
  };
}

/** The page shows its own translated card for this code; the message is the fallback. */
export const limitReached = () =>
  fail(429, "limit_reached", "You've made today's listings. Your limit resets at 6:00 AM Bangladesh time.");
