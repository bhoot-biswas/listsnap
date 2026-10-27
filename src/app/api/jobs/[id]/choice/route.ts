import { z } from "zod";
import { apiViewer } from "@/server/auth/session";
import { applyChoice } from "@/server/pipeline/execute";
import { fail, notFound, ok, unauthorized } from "@/server/http";

const Choice = z.object({
  mode: z.enum(["separate", "set", "variants"]),
  keepItemIds: z.array(z.string().uuid()).min(1).max(12),
});

/** The seller's answer on Choose items: which items, and as separate products, a set or variants. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/choice">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const body = Choice.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "invalid", "Pick at least one item and how to list them.");
  const r = await applyChoice(viewer.workspace, id, body.data);
  if (r === "not_found") return notFound();
  if (r === "not_waiting") return fail(409, "not_waiting", "This job isn't waiting for a choice any more.");
  if (r === "invalid") return fail(400, "invalid", "Pick at least one item from this photo.");
  return ok({ ok: true });
}
