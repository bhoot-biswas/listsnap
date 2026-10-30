import { apiViewer } from "@/server/auth/session";
import { verifyMediaLink } from "@/server/media/signed";
import { readMedia } from "@/server/media/store";

const ID = /^([0-9a-f-]{36})(?:\.(?:jpg|png|mp4))?$/;
const RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Serves a workspace's images and reels. Workspace-checked: another shop's id answers 404, the
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
  const typed = { ...headers, "Content-Type": file.mime, "Accept-Ranges": "bytes" };

  // a video element asks for byte ranges, and can't seek a reel without them
  const range = RANGE.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = file.data.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end)
      return new Response(null, { status: 416, headers: { ...typed, "Content-Range": `bytes */${size}` } });
    return new Response(new Uint8Array(file.data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...typed, "Content-Range": `bytes ${start}-${end}/${size}` },
    });
  }
  return new Response(new Uint8Array(file.data), { headers: typed });
}
