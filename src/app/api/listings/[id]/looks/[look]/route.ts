import { apiViewer } from "@/server/auth/session";
import { ops } from "@/server/ops";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";
import { Look } from "@/lib/schemas/looks";

/** Makes one campaign look of a listing. Safe to repeat: a made look is returned, not redrawn. `?retry=1` is "Try again". */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/looks/[look]">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id, look } = await ctx.params;
  if (!Look.safeParse(look).success) return fail(404, "unknown_look", "unknownLook");
  const retry = new URL(request.url).searchParams.get("retry") === "1";
  const r = await ops.renderLook.call(viewer.workspace, { listingId: id, look, retry }, { via: "ui" });
  if (r.ok) return stepResponse(r.value.outcome);
  if (r.error === "not_found") return notFound();
  if (r.error === "not_ready") return fail(409, "not_ready", "notFinished");
  return fail(400, "invalid", "invalidRequest");
}
