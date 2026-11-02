import { apiViewer } from "@/server/auth/session";
import { findDictation } from "@/server/dictation/sessions";
import { notFound, unauthorized } from "@/server/http";

/** The seller tapped stop: the rest of the audio goes out, and `final` arrives on the stream. */
export async function POST(_request: Request, ctx: RouteContext<"/api/dictate/[id]/end">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const d = findDictation(id, viewer.workspace.id);
  if (!d) return notFound();
  d.live.end();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
