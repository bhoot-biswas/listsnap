/**
 * How long the seller's own Facebook login still works for catalogs. Meta ends it about
 * 60 days after they connect (Page logins, which post reels, don't expire), so ListSnap
 * warns in the last two weeks and treats an expired one as "connect again" up front.
 */

export const RECONNECT_WARN_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

export type CatalogAccess =
  { state: "ok"; until: Date | null } | { state: "soon"; until: Date } | { state: "expired"; until: Date };

export function catalogAccess(expiresAt: string | null, now = Date.now()): CatalogAccess {
  const until = expiresAt ? new Date(expiresAt) : null;
  if (!until || Number.isNaN(until.getTime())) return { state: "ok", until: null };
  if (until.getTime() <= now) return { state: "expired", until };
  if (until.getTime() - now <= RECONNECT_WARN_DAYS * DAY_MS) return { state: "soon", until };
  return { state: "ok", until };
}
