import { z } from "zod";
import { apiViewer } from "@/server/auth/session";
import { executeListingStep } from "@/server/pipeline/execute";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";

const Step = z.enum(["write", "translate", "render"]);

/** Runs one listing step; render takes `?scene=studio|lifestyle|banner`. `?retry=1` is "Try again". */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/steps/[step]">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id, step } = await ctx.params;
  const parsed = Step.safeParse(step);
  if (!parsed.success) return fail(404, "unknown_step", "Unknown step.");
  const params = new URL(request.url).searchParams;
  const r = await executeListingStep(viewer.workspace, id, parsed.data, {
    scene: params.get("scene") ?? undefined,
    force: params.get("retry") === "1",
  });
  if (!r.found) return notFound();
  if ("invalid" in r) return fail(400, "invalid", r.invalid);
  return stepResponse(r.outcome);
}
