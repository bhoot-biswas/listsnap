import { apiViewer } from "@/server/auth/session";
import { verifyMediaLink } from "@/server/media/signed";
import { readMedia } from "@/server/media/store";

const ID = /^([0-9a-f-]{36})(?:\.(?:jpg|png))?$/;

/**
 * Serves a workspace's images. Workspace-checked: another shop's id answers 404, the
 * same as an id that doesn't exist. A store downloading product images has no session,
 * so it gets a short-lived signed link instead (media/signed.ts).
 *
 * The browser must ask again every time (no-cache), because a shared phone may switch
 * accounts: a long-lived cache would show the last seller's photos to the next one.
 * The id never changes content, so an allowed repeat costs a 304 and no image bytes.
 */
export async function GET(request: Request, ctx: RouteContext<"/media/[id]">) {
  const match = ID.exec((await ctx.params).id);
  const id = match?.[1];
  const params = new URL(request.url).searchParams;
  const workspaceId = !id ? null : params.has("s") ? verifyMediaLink(id, params) : (await apiViewer())?.workspace.id;
  const file = id && workspaceId ? await readMedia(workspaceId, id) : null;
  if (!file) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const etag = `"${id}"`;
  const headers = { "Cache-Control": "private, no-cache", ETag: etag, "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(file.data), { headers: { ...headers, "Content-Type": file.mime } });
}
