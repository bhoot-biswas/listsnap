import "server-only";
import { execute, json, select, selectOne } from "./pool";

export type OpVia = "ui" | "chat" | "pipeline";

export interface OpRunRow {
  id: number;
  op: string;
  via: OpVia;
  idem_key: string | null;
  status: "running" | "done" | "failed";
  listing_id: string | null;
  summary: string | null;
  result_json: unknown;
  undo_json: unknown;
  undone_at: Date | null;
}

/** Undo history kept per listing; older snapshots are dropped, the audit rows stay. */
const UNDO_KEEP = 50;

const isDuplicate = (err: unknown) => (err as { errno?: number } | null)?.errno === 1062;

export function opRunQueries(ws: string) {
  const byKey = (op: string, key: string) =>
    selectOne<OpRunRow>(
      "SELECT id, op, via, idem_key, status, listing_id, summary, result_json, undo_json, undone_at FROM op_runs WHERE workspace_id = ? AND op = ? AND idem_key = ?",
      [ws, op, key],
    );

  return {
    /**
     * Records that an op started. With a key, a second start of the same op finds the
     * first run instead (the unique key makes this atomic): a finished one is replayed,
     * a running one is busy, and a failed one is claimed again so a retry can work.
     */
    async startOpRun(run: {
      op: string;
      via: OpVia;
      idemKey: string | null;
    }): Promise<{ id: number } | { existing: OpRunRow }> {
      try {
        const r = await execute("INSERT INTO op_runs (workspace_id, op, via, idem_key) VALUES (?, ?, ?, ?)", [
          ws,
          run.op,
          run.via,
          run.idemKey,
        ]);
        return { id: r.insertId };
      } catch (err) {
        if (!run.idemKey || !isDuplicate(err)) throw err;
        const existing = await byKey(run.op, run.idemKey);
        if (!existing) throw err;
        if (existing.status !== "failed") return { existing };
        const reclaimed = await execute(
          "UPDATE op_runs SET status = 'running' WHERE id = ? AND workspace_id = ? AND status = 'failed'",
          [existing.id, ws],
        );
        return reclaimed.affectedRows === 1 ? { id: existing.id } : { existing: { ...existing, status: "running" } };
      }
    },

    async finishOpRun(
      id: number,
      end: {
        status: "done" | "failed";
        result?: unknown;
        undo?: unknown;
        listingId?: string | null;
        summary?: string | null;
      },
    ) {
      await execute(
        "UPDATE op_runs SET status = ?, result_json = ?, undo_json = ?, listing_id = ?, summary = ? WHERE id = ? AND workspace_id = ?",
        [
          end.status,
          end.result === undefined ? null : json(end.result),
          end.undo === undefined ? null : json(end.undo),
          end.listingId ?? null,
          end.summary?.slice(0, 300) ?? null,
          id,
          ws,
        ],
      );
    },

    /** The newest change to a listing that can still be undone. */
    lastUndoable: (listingId: string) =>
      selectOne<OpRunRow>(
        `SELECT id, op, via, idem_key, status, listing_id, summary, result_json, undo_json, undone_at FROM op_runs
          WHERE workspace_id = ? AND listing_id = ? AND status = 'done' AND undo_json IS NOT NULL AND undone_at IS NULL
          ORDER BY id DESC LIMIT 1`,
        [ws, listingId],
      ),

    /** Marks a run undone; false if another undo got there first. */
    async markUndone(id: number): Promise<boolean> {
      const r = await execute(
        "UPDATE op_runs SET undone_at = UTC_TIMESTAMP(3) WHERE id = ? AND workspace_id = ? AND undone_at IS NULL",
        [id, ws],
      );
      return r.affectedRows === 1;
    },

    /** Autosave makes a snapshot every few seconds; only the newest ones are worth keeping. */
    async trimUndo(listingId: string) {
      await execute(
        `UPDATE op_runs SET undo_json = NULL
          WHERE workspace_id = ? AND listing_id = ? AND undo_json IS NOT NULL AND id < (
            SELECT id FROM (
              SELECT id FROM op_runs WHERE workspace_id = ? AND listing_id = ? AND undo_json IS NOT NULL
               ORDER BY id DESC LIMIT 1 OFFSET ?
            ) AS keep
          )`,
        [ws, listingId, ws, listingId, UNDO_KEEP - 1],
      );
    },

    opRuns: (listingId: string) =>
      select<OpRunRow>(
        "SELECT id, op, via, idem_key, status, listing_id, summary, result_json, undo_json, undone_at FROM op_runs WHERE workspace_id = ? AND listing_id = ? ORDER BY id",
        [ws, listingId],
      ),
  };
}
