import { apiViewer } from "@/server/auth/session";
import { ops } from "@/server/ops";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";
import { PostRequest } from "@/lib/schemas/social";

/**
 * Posts a listing's reel to Facebook or Instagram. The body is `{ lang, destination,
 * caption }`. Safe to repeat: a post already made is returned, never made again.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/post">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const body = PostRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "invalid", "Check the caption and where to post.");
  // the seller saw the caption and the destination and pressed "Post reel": that is the confirmation
  const r = await ops.postReel.call(viewer.workspace, { listingId: id, ...body.data }, { via: "ui", confirmed: true });
  if (r.ok) return stepResponse(r.value.outcome);
  if (r.error === "not_found") return notFound();
  if (r.error === "not_ready") return fail(409, "not_ready", r.message ?? "This listing isn't finished yet.");
  return fail(400, "invalid", "Invalid request.");
}
