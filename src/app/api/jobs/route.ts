import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { saveMedia } from "@/server/media/store";
import { photoFileProblem, readPhotoFile, unreadablePhoto } from "@/server/media/upload";
import { fail, ok, unauthorized } from "@/server/http";
import { reserveListingSlot } from "@/server/limits";

const MAX_PHOTOS = 5;

/**
 * Starts a job from 1–5 photos of one product (multipart field "photos"). The browser
 * has already shrunk them to 2048 px; here each is re-encoded, which also strips EXIF
 * and GPS, and stored under MEDIA_DIR. The pipeline steps are then driven by the page.
 * With a `batchId` field the job joins that bulk upload. Each job takes one of today's
 * listing slots.
 */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "sendPhotos");
  }
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail(400, "no_photo", "addPhotoToStart");
  if (files.length > MAX_PHOTOS) return fail(400, "too_many", "tooManyPhotos", { max: MAX_PHOTOS });
  const ws = forWorkspace(viewer.workspace.id);
  // a bulk upload sends its photos one per request, each tagged with the batch
  const batchId = typeof form.get("batchId") === "string" ? (form.get("batchId") as string) : null;
  if (batchId && !(await ws.getBatch(batchId))) return fail(404, "not_found", "batchNotInShop");
  for (const f of files) {
    const problem = await photoFileProblem(f);
    if (problem) return problem;
  }

  // the slot is taken before any work, and given back if the photo never becomes a job
  const slot = await reserveListingSlot(ws, viewer.workspace, request);
  if (!slot.ok) return slot.response;
  try {
    const saved: { mediaId: string; width: number; height: number }[] = [];
    for (const f of files) {
      const photo = await readPhotoFile(f);
      if (!photo) {
        await slot.release();
        return unreadablePhoto();
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
  } catch (err) {
    await slot.release();
    throw err;
  }
}
