import "server-only";
import { randomUUID } from "node:crypto";
import type { Box } from "@/server/image-ops/types";
import { execute, json, select, selectOne, transaction } from "./pool";
import { listingQueries } from "./listings";
import { connectionQueries } from "./connections";
import { batchQueries } from "./batches";
import { overviewQueries } from "./overview";
import { usageQueries } from "./usage";
import { limitQueries } from "./limits";

export type { ListingRow, ListingStatus, RecentListingRow } from "./listings";
export type { BatchSummaryRow } from "./batches";
export type { ActivityRow, AttentionRow, Checklist, DashboardStats, ListingListRow } from "./overview";
export type { UsageCall, UsageDay, UsageStep } from "./usage";

/**
 * Every app query, bound to one workspace (no SQL outside src/server/db,
 * every query workspace-scoped). Get one with forWorkspace(viewer.workspace.id); an id
 * from another shop simply finds nothing.
 */

export type JobStatus = "processing" | "awaiting_choice" | "ready" | "failed";

export interface JobRow {
  id: string;
  status: JobStatus;
  group_mode: string | null;
  camera_angle: "top_down" | "side" | "angled" | null;
  created_at: Date;
}

export interface PhotoRow {
  id: string;
  media_id: string;
  width: number;
  height: number;
  sort: number;
}

export interface ItemRow {
  id: string;
  photo_id: string;
  instance_idx: number;
  box_json: Box;
  score: number | null;
  /** The white 1:1 main image. */
  cutout_media_id: string | null;
  /** The transparent cutout from SAM's mask; null for mock crops. */
  cutout_png_media_id: string | null;
  color: string | null;
  kept: 0 | 1;
}

export interface StepRowView {
  step: string;
  target: string;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  last_error: string | null;
  result_json: unknown;
  lock_valid: 0 | 1 | null;
}

export interface ApiCallRow {
  id: number;
  provider: string;
  model: string;
  step: string;
  mode: "mock" | "live";
  ms: number;
  cost_usd: number;
  ok: 0 | 1;
  summary: string | null;
  created_at: Date;
}

/** Job-level steps, created with every job, in run order. */
export const JOB_STEPS = ["plan", "segment", "group"] as const;

export function forWorkspace(workspaceId: string) {
  const ws = workspaceId;

  return {
    id: ws,

    async createJob(photos: { mediaId: string; width: number; height: number }[], batchId?: string): Promise<string> {
      const jobId = randomUUID();
      await transaction(async (conn) => {
        await conn.query("INSERT INTO jobs (id, workspace_id, batch_id) VALUES (?, ?, ?)", [
          jobId,
          ws,
          batchId ?? null,
        ]);
        for (const [sort, p] of photos.entries()) {
          await conn.query(
            "INSERT INTO photos (id, job_id, workspace_id, media_id, sort, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [randomUUID(), jobId, ws, p.mediaId, sort, p.width, p.height],
          );
        }
        for (const step of JOB_STEPS) {
          await conn.query("INSERT INTO job_steps (job_id, step, target, workspace_id) VALUES (?, ?, '-', ?)", [
            jobId,
            step,
            ws,
          ]);
        }
        await conn.query("INSERT INTO events (workspace_id, type, ref_id) VALUES (?, 'job_created', ?)", [ws, jobId]);
      });
      return jobId;
    },

    getJob: (id: string) =>
      selectOne<JobRow>(
        "SELECT id, status, group_mode, camera_angle, created_at FROM jobs WHERE id = ? AND workspace_id = ?",
        [id, ws],
      ),

    async updateJob(id: string, fields: { status?: JobStatus; groupMode?: string; cameraAngle?: string }) {
      await execute(
        "UPDATE jobs SET status = COALESCE(?, status), group_mode = COALESCE(?, group_mode), camera_angle = COALESCE(?, camera_angle) WHERE id = ? AND workspace_id = ?",
        [fields.status ?? null, fields.groupMode ?? null, fields.cameraAngle ?? null, id, ws],
      );
    },

    /** Moves a job between statuses only from the expected one, so two tabs can't both do it. */
    async transitionJob(id: string, from: JobStatus, to: JobStatus): Promise<boolean> {
      const r = await execute("UPDATE jobs SET status = ? WHERE id = ? AND workspace_id = ? AND status = ?", [
        to,
        id,
        ws,
        from,
      ]);
      return r.affectedRows === 1;
    },

    photos: (jobId: string) =>
      select<PhotoRow>(
        "SELECT id, media_id, width, height, sort FROM photos WHERE job_id = ? AND workspace_id = ? ORDER BY sort",
        [jobId, ws],
      ),

    async setPhotoCheck(photoId: string, check: unknown) {
      await execute("UPDATE photos SET check_json = ? WHERE id = ? AND workspace_id = ?", [json(check), photoId, ws]);
    },

    /** Replaces a photo's items; a re-run segment step must not leave the old ones behind. */
    async replaceItems(
      photoId: string,
      items: { box: Box; score: number | null; cutoutMediaId: string; cutoutPngMediaId?: string | null }[],
    ): Promise<string[]> {
      const ids = items.map(() => randomUUID());
      await transaction(async (conn) => {
        await conn.query("DELETE FROM items WHERE photo_id = ? AND workspace_id = ?", [photoId, ws]);
        for (const [i, item] of items.entries()) {
          await conn.query(
            "INSERT INTO items (id, photo_id, workspace_id, instance_idx, box_json, score, cutout_media_id, cutout_png_media_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [ids[i]!, photoId, ws, i, json(item.box), item.score, item.cutoutMediaId, item.cutoutPngMediaId ?? null],
          );
        }
      });
      return ids;
    },

    items: (jobId: string) =>
      select<ItemRow>(
        `SELECT i.id, i.photo_id, i.instance_idx, i.box_json, i.score, i.cutout_media_id, i.cutout_png_media_id, i.color, i.kept
           FROM items i JOIN photos p ON p.id = i.photo_id
          WHERE p.job_id = ? AND i.workspace_id = ? ORDER BY p.sort, i.instance_idx`,
        [jobId, ws],
      ),

    async setItemColors(colors: { itemId: string; color: string }[]) {
      for (const c of colors)
        await execute("UPDATE items SET color = ? WHERE id = ? AND workspace_id = ?", [c.color, c.itemId, ws]);
    },

    ...listingQueries(ws),
    ...connectionQueries(ws),
    ...batchQueries(ws),
    ...overviewQueries(ws),
    ...usageQueries(ws),
    ...limitQueries(ws),

    steps: (jobId: string) =>
      select<StepRowView>(
        "SELECT step, target, status, attempts, last_error, result_json, (locked_until > UTC_TIMESTAMP(3)) AS lock_valid FROM job_steps WHERE job_id = ? AND workspace_id = ?",
        [jobId, ws],
      ),

    stepResult: async <T>(jobId: string, step: string, target = "-"): Promise<T | null> => {
      const row = await selectOne<{ result_json: T }>(
        "SELECT result_json FROM job_steps WHERE job_id = ? AND step = ? AND target = ? AND workspace_id = ? AND status = 'done'",
        [jobId, step, target, ws],
      );
      return row?.result_json ?? null;
    },

    apiCalls: (jobId: string) =>
      select<ApiCallRow>(
        "SELECT id, provider, model, step, mode, ms, cost_usd, ok, summary, created_at FROM api_calls WHERE job_id = ? AND workspace_id = ? ORDER BY id",
        [jobId, ws],
      ),

    /** Sidebar badges: listings waiting for review, and today's listing slots used (the limit's own count). */
    async counts(): Promise<{ needsReview: number; listingsToday: number }> {
      const row = await selectOne<{ needs_review: number; today: number }>(
        `SELECT (SELECT COUNT(*) FROM listings WHERE workspace_id = ? AND status = 'needs_review') AS needs_review,
                (SELECT listings FROM usage_daily WHERE workspace_id = ? AND date = UTC_DATE()) AS today`,
        [ws, ws],
      );
      return { needsReview: Number(row?.needs_review ?? 0), listingsToday: Number(row?.today ?? 0) };
    },

    /** Review's AI help used today (UTC), for its daily cap. */
    async assistsToday(): Promise<number> {
      const row = await selectOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM api_calls WHERE workspace_id = ? AND step = 'assist' AND created_at >= UTC_DATE()",
        [ws],
      );
      return Number(row?.n ?? 0);
    },
  };
}

export type WorkspaceScope = ReturnType<typeof forWorkspace>;
