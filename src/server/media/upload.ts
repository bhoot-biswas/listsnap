import "server-only";
import { fail } from "@/server/http";
import { normalisePhoto } from "./store";

/** What a seller may upload as a product photo, for Snap and the chat alike. */
const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Why an uploaded file can't be used, as the response to send; null when it looks fine. */
export async function photoFileProblem(f: File): Promise<Response | null> {
  if (f.type && !TYPES.has(f.type)) return fail(415, "unsupported_file", "notPhoto");
  if (f.size > MAX_BYTES) return fail(413, "too_large", "photoTooLarge", { mb: MAX_BYTES / 1024 / 1024 });
  return null;
}

/**
 * The upload re-encoded as a JPEG, which also strips EXIF and GPS; null when it isn't a
 * photo we can read.
 */
export async function readPhotoFile(f: File): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    return await normalisePhoto(Buffer.from(await f.arrayBuffer()));
  } catch {
    return null;
  }
}

export const unreadablePhoto = () => fail(415, "unsupported_file", "unreadablePhoto");
