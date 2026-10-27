import "server-only";
import type { StepKey, StepRow, StepStore } from "@/server/pipeline/run-step";
import { execute, json, selectOne } from "./pool";

/**
 * job_steps as a StepStore. Every lock comparison uses the database clock
 * (UTC_TIMESTAMP), so two app processes with drifting clocks still agree on who
 * holds a lock. Callers have already checked the job belongs to the workspace.
 */
export function sqlStepStore(workspaceId: string): StepStore {
  const where = "job_id = ? AND step = ? AND target = ?";
  const k = (key: StepKey) => [key.jobId, key.step, key.target];

  return {
    async ensure(key) {
      await execute("INSERT IGNORE INTO job_steps (job_id, step, target, workspace_id) VALUES (?, ?, ?, ?)", [
        ...k(key),
        workspaceId,
      ]);
    },

    async get(key): Promise<StepRow | null> {
      const row = await selectOne<{
        status: StepRow["status"];
        attempts: number;
        last_error: string | null;
        result_json: unknown;
        lock_valid: 0 | 1 | null;
      }>(
        `SELECT status, attempts, last_error, result_json, (locked_until > UTC_TIMESTAMP(3)) AS lock_valid FROM job_steps WHERE ${where}`,
        k(key),
      );
      if (!row) return null;
      return {
        status: row.status,
        attempts: row.attempts,
        lastError: row.last_error,
        result: row.result_json,
        lockValid: row.lock_valid === 1,
      };
    },

    async claim(key, lockMs, maxAttempts) {
      const r = await execute(
        `UPDATE job_steps
            SET status = 'running', attempts = attempts + 1, started_at = UTC_TIMESTAMP(3),
                locked_until = UTC_TIMESTAMP(3) + INTERVAL ? MICROSECOND
          WHERE ${where} AND attempts < ?
            AND (status IN ('pending', 'failed') OR (status = 'running' AND locked_until < UTC_TIMESTAMP(3)))`,
        [lockMs * 1000, ...k(key), maxAttempts],
      );
      return r.affectedRows === 1;
    },

    async complete(key, result) {
      await execute(
        `UPDATE job_steps SET status = 'done', result_json = ?, last_error = NULL, locked_until = NULL, finished_at = UTC_TIMESTAMP(3) WHERE ${where}`,
        [json(result), ...k(key)],
      );
    },

    async fail(key, error) {
      await execute(
        `UPDATE job_steps SET status = 'failed', last_error = ?, locked_until = NULL, finished_at = UTC_TIMESTAMP(3) WHERE ${where}`,
        [error.slice(0, 500), ...k(key)],
      );
    },

    async reset(key) {
      await execute(
        `UPDATE job_steps SET status = 'pending', attempts = 0, last_error = NULL WHERE ${where} AND status = 'failed'`,
        k(key),
      );
    },
  };
}
