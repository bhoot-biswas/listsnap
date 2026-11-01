import { apiViewer } from "@/server/auth/session";
import { executeWatchStep } from "@/server/pipeline/execute";
import { notFound, stepResponse, unauthorized } from "@/server/http";
import { clientIp } from "@/server/limits";

/** Watches the batch's video and makes its jobs. `?retry=1` is the "Try again" button. */
export async function POST(request: Request, ctx: RouteContext<"/api/batches/[id]/watch">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const force = new URL(request.url).searchParams.get("retry") === "1";
  const r = await executeWatchStep(viewer.workspace, (await ctx.params).id, clientIp(request), force);
  return r.found ? stepResponse(r.outcome) : notFound();
}
