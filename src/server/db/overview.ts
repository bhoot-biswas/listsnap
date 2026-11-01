import "server-only";
import { select, selectOne } from "./pool";
import type { ListingStatus } from "./listings";
import { StoreKind } from "@/lib/stores";

/**
 * Read-only queries for the Listings page and the Dashboard, bound to one workspace.
 * Spread into forWorkspace(). Days are UTC, like the daily limits.
 */

export const LISTING_PAGE_SIZE = 20;

/** Orders the Listings page offers; "check" puts the listings the model was least sure of first. */
export const LISTING_SORTS = ["newest", "oldest", "price_low", "price_high", "check"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

const ORDER: Record<ListingSort, string> = {
  newest: "l.created_at DESC, l.sort",
  oldest: "l.created_at, l.sort",
  // a listing still waiting for its price goes last either way, not first as NULL would
  price_low: "l.price_bdt IS NULL, l.price_bdt, l.created_at DESC, l.sort",
  price_high: "l.price_bdt IS NULL, l.price_bdt DESC, l.created_at DESC, l.sort",
  check: "l.confidence IS NULL, l.confidence, l.created_at DESC, l.sort",
};

/** What a listing's search reads: titles, categories and tags in both languages. */
const SEARCHED = `JSON_EXTRACT(l.fields_json, '$.en.title', '$.bn.title', '$.en.category', '$.bn.category', '$.en.tags', '$.bn.tags')`;
/** Saved to a store, then changed: the store's draft is behind. */
const BEHIND = "(l.sent_at IS NOT NULL AND l.edited_at > l.sent_at)";

export interface ListingListRow {
  id: string;
  job_id: string;
  status: ListingStatus;
  title: string | null;
  /** Shown instead of the English title when the app is in Bangla (lib/titles.ts). */
  title_bn: string | null;
  category: string | null;
  price_bdt: number | null;
  hint_low: number | null;
  hint_high: number | null;
  confidence: number | null;
  /** More than one item in a colour-variants job: one product, several colours. */
  colors: number;
  cutout_media_id: string | null;
  created_at: Date;
  /** The stores holding a draft of it. */
  stores: StoreKind[];
  behind: boolean;
  /** The seller marked it as posted on Facebook Marketplace. */
  marketplace: boolean;
}

export interface AttentionRow {
  /** choose: waiting at Choose items; unfinished: left while still being made. */
  kind: "review" | "failed" | "choose" | "unfinished";
  job_id: string;
  listing_id: string | null;
  title: string | null;
  title_bn: string | null;
  created_at: Date;
}

export interface ActivityRow {
  id: number;
  type: string;
  ref_id: string | null;
  title: string | null;
  title_bn: string | null;
  job_id: string | null;
  created_at: Date;
}

export interface DashboardStats {
  listedToday: number;
  listedYesterday: number;
  waiting: number;
  inStoreWeek: number;
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
const TITLE_BN = "JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.bn.title'))";
const CUTOUT = `(SELECT i.cutout_media_id FROM items i
   WHERE i.id = JSON_UNQUOTE(JSON_EXTRACT(l.item_ids_json, '$[0]')) AND i.workspace_id = l.workspace_id)`;

/** LIKE treats % and _ as wildcards; a seller searching "50%" means the characters. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
// JSON text compares as binary; the collation makes "light" find "Light"
const SEARCH = `${SEARCHED} COLLATE utf8mb4_unicode_ci LIKE ?`;

export function overviewQueries(ws: string) {
  return {
    /**
     * One page of listings; `archived` shows the archived ones instead of the rest, and
     * `behind` the ones whose store draft is older than the seller's last change.
     */
    async listingPage(opts: {
      status: ListingStatus | null;
      q: string;
      page: number;
      archived?: boolean;
      behind?: boolean;
      sort?: ListingSort;
    }) {
      const where = ["l.workspace_id = ?", `l.archived_at IS ${opts.archived ? "NOT " : ""}NULL`];
      const params: (string | number)[] = [ws];
      if (opts.status) {
        where.push("l.status = ?");
        params.push(opts.status);
      }
      if (opts.behind) where.push(BEHIND);
      if (opts.q) {
        where.push(SEARCH);
        params.push(likeTerm(opts.q));
      }
      const filter = where.join(" AND ");
      const [rows, total] = await Promise.all([
        select<
          Omit<ListingListRow, "stores" | "behind" | "marketplace"> & {
            stores: string | null;
            behind: number;
            marketplace: number;
          }
        >(
          `SELECT l.id, l.job_id, l.status, l.price_bdt, l.confidence, l.created_at, ${TITLE} AS title, ${TITLE_BN} AS title_bn,
                  JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.en.category')) AS category,
                  CAST(JSON_VALUE(l.fields_json, '$.en.price_hint_bdt.low') AS SIGNED) AS hint_low,
                  CAST(JSON_VALUE(l.fields_json, '$.en.price_hint_bdt.high') AS SIGNED) AS hint_high,
                  IF(j.group_mode = 'variants', JSON_LENGTH(l.item_ids_json), 0) AS colors,
                  ${CUTOUT} AS cutout_media_id,
                  (SELECT GROUP_CONCAT(sp.kind ORDER BY sp.kind) FROM listing_store_products sp
                    WHERE sp.listing_id = l.id AND sp.workspace_id = l.workspace_id) AS stores,
                  ${BEHIND} AS behind, l.marketplace_posted_at IS NOT NULL AS marketplace
             FROM listings l JOIN jobs j ON j.id = l.job_id
            WHERE ${filter}
            ORDER BY ${ORDER[opts.sort ?? "newest"]} LIMIT ? OFFSET ?`,
          [...params, LISTING_PAGE_SIZE, (opts.page - 1) * LISTING_PAGE_SIZE],
        ),
        selectOne<{ n: number }>(`SELECT COUNT(*) AS n FROM listings l WHERE ${filter}`, params),
      ]);
      return {
        rows: rows.map((r) => ({
          ...r,
          stores: (r.stores?.split(",") ?? []).filter((k): k is StoreKind => StoreKind.safeParse(k).success),
          behind: !!Number(r.behind),
          marketplace: !!Number(r.marketplace),
        })),
        total: Number(total?.n ?? 0),
      };
    },

    /**
     * Listings per status for the filter chips, within the search so a chip's count is
     * what it opens. Archived ones count only as archived; `behind` is counted on its own.
     */
    async statusCounts(q = ""): Promise<Partial<Record<ListingStatus | "archived" | "behind", number>>> {
      const search = q ? ` AND ${SEARCH}` : "";
      const params = q ? [ws, likeTerm(q)] : [ws];
      const [rows, behind] = await Promise.all([
        select<{ status: ListingStatus | "archived"; n: number }>(
          `SELECT IF(l.archived_at IS NULL, l.status, 'archived') AS status, COUNT(*) AS n FROM listings l WHERE l.workspace_id = ?${search} GROUP BY 1`,
          params,
        ),
        selectOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM listings l WHERE l.workspace_id = ? AND l.archived_at IS NULL AND ${BEHIND}${search}`,
          params,
        ),
      ]);
      const counts: Partial<Record<ListingStatus | "archived" | "behind", number>> = Object.fromEntries(
        rows.map((r) => [r.status, Number(r.n)]),
      );
      if (Number(behind?.n)) counts.behind = Number(behind!.n);
      return counts;
    },

    async dashboardStats(): Promise<DashboardStats> {
      const [listings, timing] = await Promise.all([
        selectOne<Record<string, number | null>>(
          `SELECT SUM(created_at >= UTC_DATE()) AS today,
                  SUM(created_at >= UTC_DATE() - INTERVAL 1 DAY AND created_at < UTC_DATE()) AS yesterday,
                  SUM(status = 'needs_review' AND archived_at IS NULL) AS waiting,
                  SUM(sent_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY) AS in_store_week
             FROM listings WHERE workspace_id = ?`,
          [ws],
        ),
        // photo in to listing written: the job's steps before the seller's own review and save
        selectOne<{ s: number | null }>(
          `SELECT AVG(span) AS s FROM (
             SELECT TIMESTAMPDIFF(MICROSECOND, MIN(js.started_at), MAX(js.finished_at)) / 1e6 AS span
               FROM job_steps js JOIN jobs j ON j.id = js.job_id
              WHERE js.workspace_id = ? AND j.status = 'ready' AND js.step NOT LIKE 'store:%'
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

    /**
     * Unsure drafts, failed steps and unfinished jobs, newest first. A job only moves while
     * its page is open, so one left mid-way (or waiting at Choose items) has no listing to
     * show anywhere else. Two minutes of quiet keeps a job that is running now off the list;
     * bulk jobs have their batch page instead.
     */
    attention: (limit = 5) =>
      select<AttentionRow>(
        `(SELECT 'review' AS kind, l.job_id, l.id AS listing_id, ${TITLE} AS title, ${TITLE_BN} AS title_bn, l.created_at
            FROM listings l WHERE l.workspace_id = ? AND l.status = 'needs_review' AND l.archived_at IS NULL)
         UNION ALL
         (SELECT 'failed', j.id, l.id, ${TITLE}, ${TITLE_BN}, j.created_at
            FROM jobs j LEFT JOIN listings l ON l.job_id = j.id AND l.status = 'failed' AND l.archived_at IS NULL
           WHERE j.workspace_id = ? AND j.archived_at IS NULL AND (j.status = 'failed' OR l.id IS NOT NULL))
         UNION ALL
         (SELECT IF(j.status = 'awaiting_choice', 'choose', 'unfinished'), j.id, NULL,
                 (SELECT ${TITLE} FROM listings l WHERE l.job_id = j.id ORDER BY l.created_at LIMIT 1),
                 (SELECT ${TITLE_BN} FROM listings l WHERE l.job_id = j.id ORDER BY l.created_at LIMIT 1),
                 j.created_at
            FROM jobs j
           WHERE j.workspace_id = ? AND j.batch_id IS NULL AND j.archived_at IS NULL
             AND j.status IN ('processing', 'awaiting_choice')
             AND j.created_at < NOW(3) - INTERVAL 2 MINUTE
             AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.job_id = j.id AND l.status = 'failed'))
         ORDER BY created_at DESC LIMIT ?`,
        [ws, ws, ws, limit],
      ),

    /** Recent changes, each listing once: re-saving a draft moves it to the top instead of repeating it. */
    async activity(limit = 8): Promise<ActivityRow[]> {
      const rows = await select<ActivityRow>(
        `SELECT e.id, e.type, e.ref_id, e.created_at, ${TITLE} AS title, ${TITLE_BN} AS title_bn, l.job_id
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
        `SELECT EXISTS(SELECT 1 FROM store_connections WHERE workspace_id = ? AND kind IN ('woo', 'shopify') AND status = 'connected') AS store,
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
