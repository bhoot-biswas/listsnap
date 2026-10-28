import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { normalisePhoto, saveMedia } from "@/server/media/store";
import { fail, ok, unauthorized } from "@/server/http";

const MAX_PHOTOS = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * Starts a job from 1–5 photos of one product (multipart field "photos"). The browser
 * has already shrunk them to 2048 px; here each is re-encoded, which also strips EXIF
 * and GPS, and stored under MEDIA_DIR. The pipeline steps are then driven by the page.
 * With a `batchId` field the job joins that bulk upload.
 */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Send the photos as multipart form data.");
  }
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail(400, "no_photo", "Add a photo to start.");
  if (files.length > MAX_PHOTOS) return fail(400, "too_many", `Up to ${MAX_PHOTOS} photos of one product.`);
  const ws = forWorkspace(viewer.workspace.id);
  // a bulk upload sends its photos one per request, each tagged with the batch
  const batchId = typeof form.get("batchId") === "string" ? (form.get("batchId") as string) : null;
  if (batchId && !(await ws.getBatch(batchId))) return fail(404, "not_found", "This bulk upload isn't in your shop.");
  for (const f of files) {
    if (f.type && !TYPES.has(f.type))
      return fail(415, "unsupported_file", "That file isn't a photo. Use JPG, PNG or HEIC.");
    if (f.size > MAX_BYTES) return fail(413, "too_large", "That photo is over 15 MB. Try a smaller one.");
  }

  const saved: { mediaId: string; width: number; height: number }[] = [];
  for (const f of files) {
    let photo;
    try {
      photo = await normalisePhoto(Buffer.from(await f.arrayBuffer()));
    } catch {
      return fail(415, "unsupported_file", "That file isn't a photo we can read. Use JPG, PNG or HEIC.");
    }
    const media = await saveMedia(ws.id, "original", photo.data, {
      mime: "image/jpeg",
      width: photo.width,
      height: photo.height,
    });
    saved.push({ mediaId: media.id, width: photo.width, height: photo.height });
  }
  const id = await ws.createJob(saved, batchId ?? undefined);
  return ok({ id }, 201);
}
