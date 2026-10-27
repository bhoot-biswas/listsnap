import { apiViewer } from "@/server/auth/session";
import { loadJobState } from "@/server/pipeline/job-state";
import { notFound, ok, unauthorized } from "@/server/http";

/** The whole job from saved state: used on load, after every step and after a refresh. */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const state = await loadJobState(viewer.workspace, id);
  return state ? ok(state) : notFound();
}
