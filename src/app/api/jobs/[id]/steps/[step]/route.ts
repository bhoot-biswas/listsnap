import { z } from "zod";
import { apiViewer } from "@/server/auth/session";
import { executeJobStep } from "@/server/pipeline/execute";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";

const Step = z.enum(["plan", "segment", "group", "listen"]);

/** Runs one job-level step. `?retry=1` is the "Try again" button. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/steps/[step]">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id, step } = await ctx.params;
  const parsed = Step.safeParse(step);
  if (!parsed.success) return fail(404, "unknown_step", "unknownStep");
  const force = new URL(request.url).searchParams.get("retry") === "1";
  const r = await executeJobStep(viewer.workspace, id, parsed.data, force);
  if (!r.found) return notFound();
  if ("notReady" in r) return fail(409, "not_ready", "earlierStep");
  return stepResponse(r.outcome);
}
