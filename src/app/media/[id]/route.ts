import { apiViewer } from "@/server/auth/session";
import { verifyMediaLink } from "@/server/media/signed";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { locateMedia, sizedMedia } from "@/server/media/store";
import { MEDIA_WIDTHS, type MediaWidth } from "@/lib/media-size";

const ID = /^([0-9a-f-]{36})(?:\.(?:jpg|png|mp4))?$/;
const RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Serves a workspace's images, reels and voice notes. Workspace-checked: another shop's id answers 404, the
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
  // the shop is checked even for a 304: on a shared phone the browser's copy may be another seller's
  const found = id && workspaceId ? await locateMedia(workspaceId, id) : null;
  if (!found) return NOT_FOUND();
  // ?w= asks for a smaller copy of an image; any width outside the fixed list gets the original
  const w = Number(params.get("w"));
  const width = (MEDIA_WIDTHS as readonly number[]).includes(w) && found.mime.startsWith("image/") ? w : null;

  const etag = width ? `"${id}-w${width}"` : `"${id}"`;
  const headers = { "Cache-Control": "private, no-cache", ETag: etag, "X-Content-Type-Options": "nosniff" };
  // before any file is read: a page of thumbnails the browser already has costs no disk reads
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const file = (width && (await sizedMedia(found, width as MediaWidth))) || found;
  const size = await stat(file.abs).then(
    (s) => s.size,
    () => null,
  );
  if (size === null) return NOT_FOUND();
  const typed = { ...headers, "Content-Type": file.mime, "Accept-Ranges": "bytes" };

  // a video element asks for byte ranges, and can't seek a reel without them; only the
  // asked-for bytes are read, so seeking a reel never loads the whole file into memory
  const range = RANGE.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end)
      return new Response(null, { status: 416, headers: { ...typed, "Content-Range": `bytes */${size}` } });
    return new Response(stream(file.abs, start, end), {
      status: 206,
      headers: {
        ...typed,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(size ? stream(file.abs, 0, size - 1) : null, {
    headers: { ...typed, "Content-Length": String(size) },
  });
}

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

const stream = (abs: string, start: number, end: number) =>
  Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream<Uint8Array>;
