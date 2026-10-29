/** Statuses Review can open; the rest are still being made or failed, and their job page explains. */
const REVIEWABLE = new Set(["needs_review", "ready", "in_store", "posted"]);

/** Where a listing opens from Listings and the Dashboard. */
export function listingHref(l: { job_id: string; id: string | null; status?: string | null }) {
  return l.id && l.status && REVIEWABLE.has(l.status)
    ? (`/job/${l.job_id}/review?l=${l.id}` as const)
    : (`/job/${l.job_id}` as const);
}
