import "server-only";
import { randomUUID } from "node:crypto";
import { execute, select, selectOne } from "./pool";
import { LISTING_COLUMNS, type ListingRow } from "./listings";
import type { ItemRow, JobRow, PhotoRow, StepRowView } from "./scope";

/**
 * Bulk uploads, bound to one workspace and spread into forWorkspace(). A batch is just
 * a label on its jobs: each photo is an ordinary job, so refresh, retry and Review
 * work the same as for a single snap.
 */

/** Every job of a batch with its rows, read in one query per table, for the bulk page's poll. */
export interface BatchJobData {
  jobs: JobRow[];
  photos: (PhotoRow & { job_id: string })[];
  steps: (StepRowView & { job_id: string })[];
  items: (ItemRow & { job_id: string })[];
  listings: ListingRow[];
}

export interface BatchSummaryRow {
  id: string;
  total: number;
  created_at: Date;
  jobs: number;
  processing: number;
  waiting: number;
  failed: number;
  ready: number;
  needs_review: number;
  in_store: number;
}

const COUNTS = `
  COUNT(j.id) AS jobs,
  SUM(j.status = 'processing') AS processing,
  SUM(j.status = 'awaiting_choice') AS waiting,
  SUM(j.status = 'failed') AS failed,
  (SELECT COUNT(*) FROM listings l JOIN jobs j2 ON j2.id = l.job_id WHERE j2.batch_id = b.id AND l.status = 'ready') AS ready,
  (SELECT COUNT(*) FROM listings l JOIN jobs j2 ON j2.id = l.job_id WHERE j2.batch_id = b.id AND l.status = 'needs_review') AS needs_review,
  (SELECT COUNT(*) FROM listings l JOIN jobs j2 ON j2.id = l.job_id WHERE j2.batch_id = b.id AND l.status IN ('in_store', 'posted')) AS in_store`;

const toNumbers = (r: BatchSummaryRow): BatchSummaryRow => ({
  ...r,
  jobs: Number(r.jobs),
  processing: Number(r.processing ?? 0),
  waiting: Number(r.waiting ?? 0),
  failed: Number(r.failed ?? 0),
  ready: Number(r.ready ?? 0),
  needs_review: Number(r.needs_review ?? 0),
  in_store: Number(r.in_store ?? 0),
});

export function batchQueries(ws: string) {
  return {
    async createBatch(total: number): Promise<string> {
      const id = randomUUID();
      await execute("INSERT INTO batches (id, workspace_id, total) VALUES (?, ?, ?)", [id, ws, total]);
      return id;
    },

    getBatch: (id: string) =>
      selectOne<{ id: string; total: number; created_at: Date }>(
        "SELECT id, total, created_at FROM batches WHERE id = ? AND workspace_id = ?",
        [id, ws],
      ),

    async batches(limit = 50): Promise<BatchSummaryRow[]> {
      const rows = await select<BatchSummaryRow>(
        `SELECT b.id, b.total, b.created_at, ${COUNTS}
           FROM batches b LEFT JOIN jobs j ON j.batch_id = b.id AND j.workspace_id = b.workspace_id
          WHERE b.workspace_id = ? GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?`,
        [ws, limit],
      );
      return rows.map(toNumbers);
    },

    /** The batch's jobs in upload order. */
    /**
     * The bulk page polls every couple of seconds for up to 20 jobs; reading them one job
     * at a time was about 160 queries a poll. Steps come without their results, which only
     * the single job page shows.
     */
    async batchJobData(batchId: string): Promise<BatchJobData> {
      const inBatch = "job_id IN (SELECT id FROM jobs WHERE batch_id = ? AND workspace_id = ?)";
      const params = [ws, batchId, ws];
      const [jobs, photos, steps, items, listings] = await Promise.all([
        select<JobRow>(
          "SELECT id, status, group_mode, camera_angle, created_at, archived_at FROM jobs WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at, id",
          [batchId, ws],
        ),
        select<PhotoRow & { job_id: string }>(
          `SELECT job_id, id, media_id, width, height, sort FROM photos WHERE workspace_id = ? AND ${inBatch} ORDER BY sort`,
          params,
        ),
        select<StepRowView & { job_id: string }>(
          `SELECT job_id, step, target, status, attempts, last_error, NULL AS result_json, (locked_until > UTC_TIMESTAMP(3)) AS lock_valid
             FROM job_steps WHERE workspace_id = ? AND ${inBatch}`,
          params,
        ),
        select<ItemRow & { job_id: string }>(
          `SELECT p.job_id, i.id, i.photo_id, i.instance_idx, i.box_json, i.score, i.cutout_media_id, i.cutout_png_media_id, i.color, i.kept
             FROM items i JOIN photos p ON p.id = i.photo_id
            WHERE i.workspace_id = ? AND p.${inBatch} ORDER BY p.sort, i.instance_idx`,
          params,
        ),
        select<ListingRow>(
          `SELECT ${LISTING_COLUMNS} FROM listings WHERE workspace_id = ? AND ${inBatch} ORDER BY sort`,
          params,
        ),
      ]);
      return { jobs, photos, steps, items, listings };
    },

    batchJobIds: async (batchId: string): Promise<string[]> =>
      (
        await select<{ id: string }>(
          "SELECT id FROM jobs WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at, id",
          [batchId, ws],
        )
      ).map((r) => r.id),
  };
}
