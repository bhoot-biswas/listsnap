import "server-only";
import { randomUUID } from "node:crypto";
import { execute, select, selectOne } from "./pool";

/**
 * Bulk uploads, bound to one workspace and spread into forWorkspace(). A batch is just
 * a label on its jobs: each photo is an ordinary job, so refresh, retry and Review
 * work the same as for a single snap.
 */

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
    batchJobIds: async (batchId: string): Promise<string[]> =>
      (
        await select<{ id: string }>(
          "SELECT id FROM jobs WHERE batch_id = ? AND workspace_id = ? ORDER BY created_at, id",
          [batchId, ws],
        )
      ).map((r) => r.id),
  };
}
