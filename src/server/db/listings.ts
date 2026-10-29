import "server-only";
import { randomUUID } from "node:crypto";
import { execute, json, select, selectOne, transaction } from "./pool";

/**
 * Listing queries, bound to one workspace. Spread into forWorkspace(), so callers
 * reach them as ws.listings(), ws.markInStore() and so on, never on their own.
 */

export type ListingStatus = "processing" | "needs_review" | "ready" | "in_store" | "posted" | "failed";

export interface ListingRow {
  id: string;
  job_id: string;
  sort: number;
  item_ids_json: string[];
  status: ListingStatus;
  fields_json: { en?: unknown; bn?: unknown; variants?: unknown } | null;
  confidence: number | null;
  check_notes: string[] | null;
  stock_qty: number | null;
  price_bdt: number | null;
  wc_product_id: number | null;
  sent_at: Date | null;
  updated_at: Date;
}

/** A row for the recent-listings lists (Snap, later Dashboard and Listings). */
export interface RecentListingRow {
  id: string;
  job_id: string;
  status: ListingStatus;
  title: string | null;
  title_bn: string | null;
  cutout_media_id: string | null;
  updated_at: Date;
}

const LISTING_COLUMNS =
  "id, job_id, sort, item_ids_json, status, fields_json, confidence, check_notes, stock_qty, price_bdt, wc_product_id, sent_at, updated_at";

export function listingQueries(ws: string) {
  return {
    /**
     * Creates the job's listings once. If they already exist (a repeated request), the
     * existing ids come back unchanged, so a double click never makes duplicates.
     */
    async createListings(jobId: string, groups: { itemIds: string[]; stockQty?: number | null }[]): Promise<string[]> {
      return transaction(async (conn) => {
        await conn.query("SELECT id FROM jobs WHERE id = ? AND workspace_id = ? FOR UPDATE", [jobId, ws]);
        const [existing] = await conn.query(
          "SELECT id FROM listings WHERE job_id = ? AND workspace_id = ? ORDER BY sort",
          [jobId, ws],
        );
        const rows = existing as { id: string }[];
        if (rows.length) return rows.map((r) => r.id);
        const ids: string[] = [];
        for (const [sort, g] of groups.entries()) {
          const id = randomUUID();
          ids.push(id);
          await conn.query(
            "INSERT INTO listings (id, job_id, workspace_id, sort, item_ids_json, stock_qty) VALUES (?, ?, ?, ?, ?, ?)",
            [id, jobId, ws, sort, json(g.itemIds), g.stockQty ?? null],
          );
        }
        return ids;
      });
    },

    listings: (jobId: string) =>
      select<ListingRow>(
        `SELECT ${LISTING_COLUMNS} FROM listings WHERE job_id = ? AND workspace_id = ? ORDER BY sort`,
        [jobId, ws],
      ),

    getListing: (id: string) =>
      selectOne<ListingRow>(`SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ? AND workspace_id = ?`, [id, ws]),

    /**
     * Saves one language's text. Read-modify-write under a row lock rather than JSON_SET,
     * because MariaDB and MySQL disagree on casting a parameter to JSON, and write and
     * translate for the same listing can finish at the same moment.
     */
    async saveListingText(
      id: string,
      lang: "en" | "bn",
      fields: unknown,
      extra: { confidence?: number; checkNotes?: string[]; status?: ListingStatus } = {},
    ) {
      await transaction(async (conn) => {
        const [rows] = await conn.query(
          "SELECT fields_json FROM listings WHERE id = ? AND workspace_id = ? FOR UPDATE",
          [id, ws],
        );
        const current = (rows as { fields_json: Record<string, unknown> | string | null }[])[0]?.fields_json;
        const parsed = typeof current === "string" ? (JSON.parse(current) as Record<string, unknown>) : (current ?? {});
        await conn.query(
          `UPDATE listings SET fields_json = ?, confidence = COALESCE(?, confidence), check_notes = COALESCE(?, check_notes), status = COALESCE(?, status)
            WHERE id = ? AND workspace_id = ?`,
          [
            json({ ...parsed, [lang]: fields }),
            extra.confidence ?? null,
            extra.checkNotes ? json(extra.checkNotes) : null,
            extra.status ?? null,
            id,
            ws,
          ],
        );
      });
    },

    async setListingStatus(id: string, status: ListingStatus) {
      await execute("UPDATE listings SET status = ? WHERE id = ? AND workspace_id = ?", [status, id, ws]);
    },

    listingMedia: (listingIds: string[]) =>
      listingIds.length
        ? select<{ id: string; listing_id: string; kind: string; width: number; height: number; selected: 0 | 1 }>(
            `SELECT id, listing_id, kind, width, height, selected FROM media WHERE workspace_id = ? AND listing_id IN (${listingIds.map(() => "?").join(",")}) ORDER BY sort, created_at`,
            [ws, ...listingIds],
          )
        : Promise.resolve([]),

    /**
     * The seller's edits from Review. The text replaces each language's editable fields
     * but keeps what the seller can't edit (the price hint, confidence, check notes), so
     * the AI's own view of the listing stays readable. One row lock, like saveListingText.
     */
    async saveListingEdits(
      id: string,
      edit: {
        en: object;
        bn: object | null;
        priceBdt: number | null;
        stockQty: number | null;
        selectedMediaIds: string[];
        /** Undefined keeps the saved colours. */
        variants?: object[] | null;
      },
    ) {
      await transaction(async (conn) => {
        const [rows] = await conn.query(
          "SELECT fields_json FROM listings WHERE id = ? AND workspace_id = ? FOR UPDATE",
          [id, ws],
        );
        const current = (rows as { fields_json: Record<string, unknown> | string | null }[])[0]?.fields_json;
        const fields = typeof current === "string" ? (JSON.parse(current) as Record<string, unknown>) : (current ?? {});
        const next = {
          ...fields,
          en: { ...(fields.en as object), ...edit.en },
          ...(edit.bn ? { bn: { ...(fields.bn as object), ...edit.bn } } : {}),
          ...(edit.variants ? { variants: edit.variants } : {}),
        };
        await conn.query(
          "UPDATE listings SET fields_json = ?, price_bdt = ?, stock_qty = ? WHERE id = ? AND workspace_id = ?",
          [json(next), edit.priceBdt, edit.stockQty, id, ws],
        );
        await conn.query(
          `UPDATE media SET selected = COALESCE(id IN (${edit.selectedMediaIds.map(() => "?").join(",") || "NULL"}), 0) WHERE listing_id = ? AND workspace_id = ?`,
          [...edit.selectedMediaIds, id, ws],
        );
      });
    },

    /** A store draft exists now; the id lets a later save update it instead of making another. */
    async markInStore(id: string, productId: number) {
      await execute(
        "UPDATE listings SET status = 'in_store', wc_product_id = ?, sent_at = UTC_TIMESTAMP(3) WHERE id = ? AND workspace_id = ?",
        [productId, id, ws],
      );
      await execute("INSERT INTO events (workspace_id, type, ref_id) VALUES (?, 'sent_to_store', ?)", [ws, id]);
    },

    recentListings: (limit = 5) =>
      select<RecentListingRow>(
        `SELECT l.id, l.job_id, l.status, l.updated_at,
                JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.en.title')) AS title,
                JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.bn.title')) AS title_bn,
                (SELECT i.cutout_media_id FROM items i
                  WHERE i.id = JSON_UNQUOTE(JSON_EXTRACT(l.item_ids_json, '$[0]')) AND i.workspace_id = l.workspace_id) AS cutout_media_id
           FROM listings l WHERE l.workspace_id = ? ORDER BY l.created_at DESC, l.sort LIMIT ?`,
        [ws, limit],
      ),
  };
}
