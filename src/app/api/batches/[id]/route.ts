import { apiViewer } from "@/server/auth/session";
import { loadBatchState } from "@/server/pipeline/batch-state";
import { notFound, ok, unauthorized } from "@/server/http";
import { requestLocale } from "@/server/step-text";

/** The batch's rows and the step calls each unfinished job needs next. */
export async function GET(_request: Request, ctx: RouteContext<"/api/batches/[id]">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const state = await loadBatchState(viewer.workspace, (await ctx.params).id, await requestLocale());
  return state ? ok(state) : notFound();
}
