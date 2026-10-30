import "server-only";
import { execute } from "@/server/db/pool";
import type { CallContext } from "./types";

export interface CallInfo {
  provider: "meta" | "woo" | "instagram" | "video";
  model: string;
  endpoint: string;
  mode: "mock" | "live";
}

/**
 * Times an outside call and records it in api_calls, whether it worked or not. This
 * feeds the Under the hood panel, Usage "by step" and the README cost numbers. The
 * summary is written by the caller from the result, so secrets and photos never reach
 * the log; errors keep only their message, cut short.
 */
export async function logged<T>(
  ctx: CallContext,
  info: CallInfo,
  fn: () => Promise<T>,
  describe: (result: T) => { summary: string; costUsd: number },
): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    const { summary, costUsd } = describe(result);
    await record(ctx, info, Math.round(performance.now() - started), true, summary, costUsd);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await record(ctx, info, Math.round(performance.now() - started), false, message, 0);
    throw err;
  }
}

async function record(ctx: CallContext, info: CallInfo, ms: number, ok: boolean, summary: string, costUsd: number) {
  try {
    await execute(
      "INSERT INTO api_calls (workspace_id, job_id, provider, model, endpoint, step, mode, ms, cost_usd, ok, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        ctx.workspaceId,
        ctx.jobId,
        info.provider,
        info.model,
        info.endpoint,
        ctx.step,
        info.mode,
        ms,
        costUsd,
        ok,
        summary.slice(0, 300),
      ],
    );
  } catch (err) {
    // a lost log line must never fail the step that made the call
    console.error("[api_calls] could not record:", err instanceof Error ? err.message : err);
  }
}
