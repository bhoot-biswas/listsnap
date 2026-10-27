import { apiViewer } from "@/server/auth/session";
import { executeStoreStep } from "@/server/pipeline/store-step";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";

/** Saves the listing to the shop's store as a draft (never published). Safe to repeat. */
export async function POST(_request: Request, ctx: RouteContext<"/api/listings/[id]/store">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const r = await executeStoreStep(viewer.workspace, id);
  if (!r.found) return notFound();
  if ("invalid" in r) return fail(409, "not_ready", r.invalid);
  return stepResponse(r.outcome);
}
