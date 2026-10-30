import "server-only";
import type { z } from "zod";
import { forWorkspace, type OpVia, type WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";

/**
 * An operation is one thing the seller can ask for: edit a field, make a photo, save a
 * draft. The UI calls it today and chat tools will call the same object later, so every
 * rule lives here once:
 *
 * 1. The caller authenticates (requireWorkspace / apiViewer) and passes the workspace;
 *    the op reaches data only through that workspace's scope, so another shop's id is
 *    "not found".
 * 2. Input is checked with the op's Zod schema, even when our own UI built it.
 * 3. `changes_store` ops run only when the caller says the seller confirmed.
 * 4. A repeated call with the same idempotency key gets the first result back.
 * 5. Every non-read run is recorded in op_runs; an op that returns `undo` can be undone.
 */

/** What an op does, which decides how a caller must treat it. */
export type Effect = "read" | "edits_draft" | "creates_media" | "changes_store";

export type OpError = "invalid" | "not_found" | "not_ready" | "needs_confirmation" | "busy" | "failed";

export interface OpMeta {
  via: OpVia;
  /** Same key, same op: the work runs once. A form token, or a chat tool-call id. */
  idempotencyKey?: string;
  /** The seller pressed the button or approved the chat's request. Required for changes_store. */
  confirmed?: boolean;
}

export interface OpContext {
  workspace: Workspace;
  ws: WorkspaceScope;
  meta: OpMeta;
}

/** What an op's own code returns. `undo` is whatever its undo needs to put things back. */
export type RunResult<T> =
  | { ok: true; value: T; listingId?: string; summary?: string; undo?: unknown }
  | { ok: false; error: OpError; message?: string };

/** What callers get back. `message` is seller-facing (a StepError's words) when present. */
export type OpResult<T> = { ok: true; value: T; replayed: boolean } | { ok: false; error: OpError; message?: string };

export interface Cost {
  /** Daily AI photo slots it may use. */
  images: number;
}

export interface OpDefinition<S extends z.ZodType, T> {
  /** Stable: it becomes the chat tool's name. */
  name: string;
  /** For the model choosing a tool: what it does and when to use it, in English. */
  description: string;
  input: S;
  effect: Effect;
  cost?: (input: z.infer<S>) => Cost;
  run: (ctx: OpContext, input: z.infer<S>) => Promise<RunResult<T>>;
}

export interface Op<S extends z.ZodType = z.ZodType, T = unknown> extends OpDefinition<S, T> {
  call(workspace: Workspace, rawInput: unknown, meta: OpMeta): Promise<OpResult<T>>;
}

const NO_COST: Cost = { images: 0 };

export function defineOp<S extends z.ZodType, T>(def: OpDefinition<S, T>): Op<S, T> {
  return {
    ...def,
    cost: def.cost ?? (() => NO_COST),
    async call(workspace, rawInput, meta) {
      const parsed = def.input.safeParse(rawInput);
      if (!parsed.success) return { ok: false, error: "invalid" };
      if (def.effect === "changes_store" && !meta.confirmed) return { ok: false, error: "needs_confirmation" };

      const ctx: OpContext = { workspace, ws: forWorkspace(workspace.id), meta };
      if (def.effect === "read") return finish(await def.run(ctx, parsed.data));

      const started = await ctx.ws.startOpRun({ op: def.name, via: meta.via, idemKey: meta.idempotencyKey ?? null });
      if ("existing" in started) {
        const prior = started.existing;
        if (prior.status === "running") return { ok: false, error: "busy" };
        return { ok: true, value: prior.result_json as T, replayed: true };
      }

      let result: RunResult<T>;
      try {
        result = await def.run(ctx, parsed.data);
      } catch (err) {
        // a bug or an outage: record the failure, then let the caller's error handling see it
        await ctx.ws.finishOpRun(started.id, { status: "failed" });
        throw err;
      }
      if (!result.ok) {
        await ctx.ws.finishOpRun(started.id, { status: "failed", result: { error: result.error } });
        return result;
      }
      // the listing is recorded only once the op has found it in this workspace
      await ctx.ws.finishOpRun(started.id, {
        status: "done",
        result: result.value,
        undo: result.undo,
        listingId: result.listingId ?? null,
        summary: result.summary ?? null,
      });
      if (result.undo !== undefined && result.listingId) await ctx.ws.trimUndo(result.listingId);
      return { ok: true, value: result.value, replayed: false };
    },
  };
}

function finish<T>(r: RunResult<T>): OpResult<T> {
  return r.ok ? { ok: true, value: r.value, replayed: false } : r;
}
