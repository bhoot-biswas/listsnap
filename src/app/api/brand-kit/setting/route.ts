import { apiViewer } from "@/server/auth/session";
import { mediaUrl, normalisePhoto, saveMedia } from "@/server/media/store";
import { fail, ok, unauthorized } from "@/server/http";
import { BRAND_PHOTO_MAX_BYTES } from "@/lib/schemas/brand-kit";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * Uploads the brand kit's shop photo (multipart field "photo"). It is re-encoded like
 * every upload, which strips EXIF and GPS, and stored as the shop's own media. Saving
 * the kit is a separate step, so a photo that is never saved simply stays unused.
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
  if (!(file instanceof File) || file.size === 0) return fail(400, "no_photo", "Add a photo.");
  if (file.type && !TYPES.has(file.type)) return fail(415, "unsupported_file", "Use a JPG, PNG or HEIC photo.");
  if (file.size > BRAND_PHOTO_MAX_BYTES) return fail(413, "too_large", "That photo is over 8 MB.");

  let photo;
  try {
    photo = await normalisePhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    return fail(415, "unsupported_file", "That file isn't a photo we can read.");
  }
  const media = await saveMedia(viewer.workspace.id, "brand", photo.data, {
    mime: "image/jpeg",
    width: photo.width,
    height: photo.height,
  });
  return ok({ id: media.id, url: mediaUrl(media.id) }, 201);
}
