import "server-only";
import { select, selectOne } from "./pool";
import { dhakaDay } from "@/lib/dhaka-day";
import { dhakaDate, dhakaDayStart } from "./dhaka-sql";
import { MEDIA_GROUPS } from "./media-library";

/**
 * Usage numbers for the Usage page, bound to one workspace. Spread into forWorkspace().
 * Read straight from listings, media and the API log, so they can't drift from what
 * happened. Days are UTC, like the daily limits.
 */

export const USAGE_DAYS = 30;

/**
 * Made by Muse Image, campaign looks included, since each takes a daily photo slot like a
 * scene does; cutouts and main images are SAM and local work. The Media library's list, so
 * the two pages can't count differently.
 */
const AI_PHOTO_KINDS = MEDIA_GROUPS.ai;

export interface UsageDay {
  day: string;
  listings: number;
  photos: number;
  calls: number;
  cost: number;
}

export interface UsageStep {
  provider: string;
  step: string;
  /** Without the " (mock)" suffix mock calls carry. */
  model: string;
  calls: number;
  mock: number;
  failed: number;
  /** Live calls only; null when every call was mocked. */
  avg_ms: number | null;
  cost: number;
}

export interface UsageCall {
  id: number;
  job_id: string | null;
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

export function usageQueries(ws: string) {
  return {
    /** Each of the last 30 Dhaka days, oldest first, zero-filled. Calls and cost count AI calls only. */
    async usageDays(): Promise<UsageDay[]> {
      const since = dhakaDayStart(USAGE_DAYS - 1);
      const [listings, photos, calls] = await Promise.all([
        select<{ day: string; n: number }>(
          `SELECT ${dhakaDate("created_at")} AS day, COUNT(*) AS n FROM listings
            WHERE workspace_id = ? AND created_at >= ${since} GROUP BY day`,
          [ws],
        ),
        select<{ day: string; n: number }>(
          `SELECT ${dhakaDate("created_at")} AS day, COUNT(*) AS n FROM media
            WHERE workspace_id = ? AND kind IN (${AI_PHOTO_KINDS.map(() => "?").join(", ")})
              AND created_at >= ${since} GROUP BY day`,
          [ws, ...AI_PHOTO_KINDS],
        ),
        select<{ day: string; n: number; cost: number }>(
          `SELECT ${dhakaDate("created_at")} AS day, COUNT(*) AS n, SUM(cost_usd) AS cost FROM api_calls
            WHERE workspace_id = ? AND provider = 'meta' AND created_at >= ${since} GROUP BY day`,
          [ws],
        ),
      ]);
      const map = <T extends { day: string }>(rows: T[]) => new Map(rows.map((r) => [r.day, r]));
      const [l, p, c] = [map(listings), map(photos), map(calls)];
      const now = Date.now();
      return Array.from({ length: USAGE_DAYS }, (_, i) => {
        const day = dhakaDay(now, USAGE_DAYS - 1 - i);
        return {
          day,
          listings: Number(l.get(day)?.n ?? 0),
          photos: Number(p.get(day)?.n ?? 0),
          calls: Number(c.get(day)?.n ?? 0),
          cost: Number(c.get(day)?.cost ?? 0),
        };
      });
    },

    /** AI calls today (the Dhaka day), for Usage's Behind the scenes. */
    async callsToday(): Promise<{ calls: number; cost: number }> {
      const row = await selectOne<{ n: number; cost: number | null }>(
        `SELECT COUNT(*) AS n, SUM(cost_usd) AS cost FROM api_calls WHERE workspace_id = ? AND provider = 'meta' AND created_at >= ${dhakaDayStart()}`,
        [ws],
      );
      return { calls: Number(row?.n ?? 0), cost: Number(row?.cost ?? 0) };
    },

    /** Calls, failures, time and cost per pipeline step over the last 30 days, costliest first. */
    usageBySteps: () =>
      select<UsageStep>(
        `SELECT provider, step, SUBSTRING_INDEX(MAX(model), ' (mock)', 1) AS model, COUNT(*) AS calls, SUM(mode = 'mock') AS mock, SUM(NOT ok) AS failed,
                ROUND(AVG(IF(mode = 'live', ms, NULL))) AS avg_ms, SUM(cost_usd) AS cost
           FROM api_calls WHERE workspace_id = ? AND created_at >= ${dhakaDayStart(USAGE_DAYS - 1)}
          GROUP BY provider, step ORDER BY cost DESC, calls DESC`,
        [ws],
      ),

    /** The newest AI calls across the shop: the same log as a job's Under the hood panel. */
    recentCalls: (limit = 25) =>
      select<UsageCall>(
        `SELECT id, job_id, provider, model, step, mode, ms, cost_usd, ok, summary, created_at
           FROM api_calls WHERE workspace_id = ? AND provider = 'meta' ORDER BY id DESC LIMIT ?`,
        [ws, limit],
      ),
  };
}
