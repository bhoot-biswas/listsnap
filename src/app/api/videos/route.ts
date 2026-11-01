import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { fail, ok, unauthorized } from "@/server/http";
import { saveMedia } from "@/server/media/store";
import { openVideo } from "@/server/media/video";
import { VIDEO_MAX_MB, VIDEO_MAX_S } from "@/lib/schemas/video";

const TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
/** Each video is up to twelve listings, so a few a day is already a lot of listings. */
const PER_DAY = 5;

/**
 * Starts a bulk batch from a video of the seller's products, sent as the raw request body
 * (not a form, so a phone's large file streams in without being held twice). The video is
 * kept as media; watching it is the batch's first step, driven by the bulk page, which
 * makes one job per product it finds. Listing slots are taken then, one per product.
 */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!TYPES.has(type)) return fail(415, "unsupported_file", "notVideo");
  const max = VIDEO_MAX_MB * 1024 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > max)
    return fail(413, "too_large", "videoTooLarge", { mb: VIDEO_MAX_MB });

  const ws = forWorkspace(viewer.workspace.id);
  if ((await ws.videosToday()) >= PER_DAY) return fail(429, "limit", "videoLimit");

  const data = await readCapped(request, max);
  if (!data) return fail(413, "too_large", "videoTooLarge", { mb: VIDEO_MAX_MB });
  const video = await openVideo(data);
  let seconds: number | null;
  try {
    seconds = await video.seconds();
  } finally {
    await video.done();
  }
  if (!seconds) return fail(415, "unsupported_file", "unreadableVideo");
  // a second over is a rounding of the phone's own limit, not a longer video
  if (seconds > VIDEO_MAX_S + 1) return fail(400, "too_long", "videoTooLong", { minutes: VIDEO_MAX_S / 60 });

  const media = await saveMedia(ws.id, "video", data, { mime: type, width: 0, height: 0, selected: false });
  const batchId = await ws.createVideoBatch(media.id);
  return ok({ batchId }, 201);
}

/** The body, or null once it passes `max` bytes, whatever Content-Length claimed. */
async function readCapped(request: Request, max: number): Promise<Buffer | null> {
  if (!request.body) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return size ? Buffer.concat(chunks) : null;
}
