import { apiViewer } from "@/server/auth/session";
import { readMedia } from "@/server/media/store";

/**
 * Serves a workspace's images. Workspace-checked: another shop's id answers 404, the
 * same as an id that doesn't exist. Instagram needs public URLs; that comes in Phase 6
 * as short-lived signed links, not by opening this route.
 *
 * The browser must ask again every time (no-cache), because a shared phone may switch
 * accounts: a long-lived cache would show the last seller's photos to the next one.
 * The id never changes content, so an allowed repeat costs a 304 and no image bytes.
 */
export async function GET(request: Request, ctx: RouteContext<"/media/[id]">) {
  const { id } = await ctx.params;
  const viewer = await apiViewer();
  const file = viewer && /^[0-9a-f-]{36}$/.test(id) ? await readMedia(viewer.workspace.id, id) : null;
  if (!file) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const etag = `"${id}"`;
  const headers = { "Cache-Control": "private, no-cache", ETag: etag, "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(file.data), { headers: { ...headers, "Content-Type": file.mime } });
}
