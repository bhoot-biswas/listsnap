import { apiViewer } from "@/server/auth/session";
import { executeStoreStep } from "@/server/pipeline/store-step";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";

/** Saves the listing to the shop's store as a draft (never published). Safe to repeat; `?update=1` sends edits again. */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/store">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const update = new URL(request.url).searchParams.get("update") === "1";
  const r = await executeStoreStep(viewer.workspace, id, { update });
  if (!r.found) return notFound();
  if ("invalid" in r) return fail(409, "not_ready", r.invalid);
  return stepResponse(r.outcome);
}
