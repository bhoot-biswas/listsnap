import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { fail, ok, unauthorized } from "@/server/http";
import { mediaUrl, saveMedia } from "@/server/media/store";
import { photoFileProblem, readPhotoFile, unreadablePhoto } from "@/server/media/upload";

/** Photos a shop may attach in a day without making listings of them; past this it's not a chat. */
const LOOSE_PER_DAY = 40;

/**
 * One photo attached in the chat (multipart field "photo"), stored as an original like
 * Snap's, so a listing can start from it without uploading it again. The message then
 * names it by id. It takes no listing slot until the chat starts a listing from it.
 */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "Send the photo as multipart form data.");
  }
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size) return fail(400, "no_photo", "Add a photo first.");
  const problem = photoFileProblem(file);
  if (problem) return problem;

  const ws = forWorkspace(viewer.workspace.id);
  if ((await ws.loosePhotosToday()) >= LOOSE_PER_DAY)
    return fail(429, "limit", "That's a lot of photos for one day. Make listings from the ones you've sent first.");
  const photo = await readPhotoFile(file);
  if (!photo) return unreadablePhoto();
  const media = await saveMedia(ws.id, "original", photo.data, {
    mime: "image/jpeg",
    width: photo.width,
    height: photo.height,
  });
  return ok({ id: media.id, url: mediaUrl(media.id) }, 201);
}
