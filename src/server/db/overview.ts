import "server-only";
import { select, selectOne } from "./pool";
import type { ListingStatus } from "./listings";

/**
 * Read-only queries for the Listings page and the Dashboard, bound to one workspace.
 * Spread into forWorkspace(). Days are UTC, like the daily limits.
 */

export const LISTING_PAGE_SIZE = 20;

export interface ListingListRow {
  id: string;
  job_id: string;
  status: ListingStatus;
  title: string | null;
  category: string | null;
  price_bdt: number | null;
  hint_low: number | null;
  hint_high: number | null;
  confidence: number | null;
  /** More than one item in a colour-variants job: one product, several colours. */
  colors: number;
  cutout_media_id: string | null;
  created_at: Date;
}

export interface AttentionRow {
  kind: "review" | "failed";
  job_id: string;
  listing_id: string | null;
  title: string | null;
  created_at: Date;
}

export interface ActivityRow {
  id: number;
  type: string;
  ref_id: string | null;
  title: string | null;
  job_id: string | null;
  created_at: Date;
}

export interface DashboardStats {
  listedToday: number;
  listedYesterday: number;
  waiting: number;
  inStoreWeek: number;
  imagesToday: number;
  costToday: number;
  /** Photo in to listing written, averaged over the last 7 days' finished jobs. */
  avgSeconds: number | null;
}

export interface Checklist {
  store: boolean;
  listing: boolean;
  bulk: boolean;
  colors: boolean;
}

const TITLE = "JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.en.title'))";
const CUTOUT = `(SELECT i.cutout_media_id FROM items i
   WHERE i.id = JSON_UNQUOTE(JSON_EXTRACT(l.item_ids_json, '$[0]')) AND i.workspace_id = l.workspace_id)`;

/** LIKE treats % and _ as wildcards; a seller searching "50%" means the characters. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function overviewQueries(ws: string) {
  return {
    async listingPage(opts: { status: ListingStatus | null; q: string; page: number }) {
      const where = ["l.workspace_id = ?"];
      const params: (string | number)[] = [ws];
      if (opts.status) {
        where.push("l.status = ?");
        params.push(opts.status);
      }
      if (opts.q) {
        // JSON text compares as binary; the collation makes "light" find "Light"
        where.push(
          `(${TITLE} COLLATE utf8mb4_unicode_ci LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.bn.title')) COLLATE utf8mb4_unicode_ci LIKE ?)`,
        );
        params.push(likeTerm(opts.q), likeTerm(opts.q));
      }
      const filter = where.join(" AND ");
      const [rows, total] = await Promise.all([
        select<ListingListRow>(
          `SELECT l.id, l.job_id, l.status, l.price_bdt, l.confidence, l.created_at, ${TITLE} AS title,
                  JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.en.category')) AS category,
                  CAST(JSON_VALUE(l.fields_json, '$.en.price_hint_bdt.low') AS SIGNED) AS hint_low,
                  CAST(JSON_VALUE(l.fields_json, '$.en.price_hint_bdt.high') AS SIGNED) AS hint_high,
                  IF(j.group_mode = 'variants', JSON_LENGTH(l.item_ids_json), 0) AS colors,
                  ${CUTOUT} AS cutout_media_id
             FROM listings l JOIN jobs j ON j.id = l.job_id
            WHERE ${filter}
            ORDER BY l.created_at DESC, l.sort LIMIT ? OFFSET ?`,
          [...params, LISTING_PAGE_SIZE, (opts.page - 1) * LISTING_PAGE_SIZE],
        ),
        selectOne<{ n: number }>(`SELECT COUNT(*) AS n FROM listings l WHERE ${filter}`, params),
      ]);
      return { rows, total: Number(total?.n ?? 0) };
    },

    /** Listings per status, for the filter chips' counts. */
    async statusCounts(): Promise<Partial<Record<ListingStatus, number>>> {
      const rows = await select<{ status: ListingStatus; n: number }>(
        "SELECT status, COUNT(*) AS n FROM listings WHERE workspace_id = ? GROUP BY status",
        [ws],
      );
      return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    },

    async dashboardStats(): Promise<DashboardStats> {
      const [listings, usage, timing] = await Promise.all([
        selectOne<Record<string, number | null>>(
          `SELECT SUM(created_at >= UTC_DATE()) AS today,
                  SUM(created_at >= UTC_DATE() - INTERVAL 1 DAY AND created_at < UTC_DATE()) AS yesterday,
                  SUM(status = 'needs_review') AS waiting,
                  SUM(sent_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY) AS in_store_week
             FROM listings WHERE workspace_id = ?`,
          [ws],
        ),
        selectOne<{ images: number | null; cost: number | null }>(
          `SELECT (SELECT COUNT(*) FROM media WHERE workspace_id = ? AND kind IN ('studio', 'lifestyle', 'banner')
                     AND created_at >= UTC_DATE()) AS images,
                  (SELECT SUM(cost_usd) FROM api_calls WHERE workspace_id = ? AND created_at >= UTC_DATE()) AS cost`,
          [ws, ws],
        ),
        // photo in to listing written: the job's steps before the seller's own review and save
        selectOne<{ s: number | null }>(
          `SELECT AVG(span) AS s FROM (
             SELECT TIMESTAMPDIFF(MICROSECOND, MIN(js.started_at), MAX(js.finished_at)) / 1e6 AS span
               FROM job_steps js JOIN jobs j ON j.id = js.job_id
              WHERE js.workspace_id = ? AND j.status = 'ready' AND js.step <> 'store'
                AND j.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
              GROUP BY js.job_id HAVING COUNT(*) = SUM(js.status = 'done')) t`,
          [ws],
        ),
      ]);
      const n = (v: number | null | undefined) => Number(v ?? 0);
      return {
        listedToday: n(listings?.today),
        listedYesterday: n(listings?.yesterday),
        waiting: n(listings?.waiting),
        inStoreWeek: n(listings?.in_store_week),
        imagesToday: n(usage?.images),
        costToday: n(usage?.cost),
        avgSeconds: timing?.s == null ? null : Math.round(Number(timing.s)),
      };
    },

    /** Listings made on each of the last 7 days (UTC), oldest first, zero-filled. */
    async listingsPerDay(): Promise<{ day: string; n: number }[]> {
      const rows = await select<{ day: string; n: number }>(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS n FROM listings
          WHERE workspace_id = ? AND created_at >= UTC_DATE() - INTERVAL 6 DAY GROUP BY day`,
        [ws],
      );
      const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
      return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10);
        return { day, n: byDay.get(day) ?? 0 };
      });
    },

    /** Unsure drafts and failed steps, newest first. */
    attention: (limit = 5) =>
      select<AttentionRow>(
        `(SELECT 'review' AS kind, l.job_id, l.id AS listing_id, ${TITLE} AS title, l.created_at
            FROM listings l WHERE l.workspace_id = ? AND l.status = 'needs_review')
         UNION ALL
         (SELECT 'failed', j.id, l.id, ${TITLE}, j.created_at
            FROM jobs j LEFT JOIN listings l ON l.job_id = j.id AND l.status = 'failed'
           WHERE j.workspace_id = ? AND (j.status = 'failed' OR l.id IS NOT NULL))
         ORDER BY created_at DESC LIMIT ?`,
        [ws, ws, limit],
      ),

    /** Recent changes, each listing once: re-saving a draft moves it to the top instead of repeating it. */
    async activity(limit = 8): Promise<ActivityRow[]> {
      const rows = await select<ActivityRow>(
        `SELECT e.id, e.type, e.ref_id, e.created_at, ${TITLE} AS title, l.job_id
           FROM events e LEFT JOIN listings l ON e.type = 'sent_to_store' AND l.id = e.ref_id AND l.workspace_id = e.workspace_id
          WHERE e.workspace_id = ? AND e.type IN ('sent_to_store', 'connection_saved', 'connection_removed')
          ORDER BY e.id DESC LIMIT ?`,
        [ws, limit * 4],
      );
      const seen = new Set<string>();
      return rows
        .filter((r) => r.type !== "sent_to_store" || !r.ref_id || (!seen.has(r.ref_id) && seen.add(r.ref_id)))
        .slice(0, limit);
    },

    async checklist(): Promise<Checklist> {
      const row = await selectOne<Record<keyof Checklist, number>>(
        `SELECT EXISTS(SELECT 1 FROM store_connections WHERE workspace_id = ? AND kind = 'woo' AND status = 'connected') AS store,
                EXISTS(SELECT 1 FROM listings WHERE workspace_id = ?) AS listing,
                EXISTS(SELECT 1 FROM batches WHERE workspace_id = ?) AS bulk,
                EXISTS(SELECT 1 FROM listings l JOIN jobs j ON j.id = l.job_id
                        WHERE l.workspace_id = ? AND j.group_mode = 'variants' AND JSON_LENGTH(l.item_ids_json) > 1) AS colors`,
        [ws, ws, ws, ws],
      );
      return { store: !!row?.store, listing: !!row?.listing, bulk: !!row?.bulk, colors: !!row?.colors };
    },
  };
}
