import "server-only";
import { randomUUID } from "node:crypto";
import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "@/server/env";
import type { LookKind } from "@/lib/schemas/looks";
import type { MediaWidth } from "@/lib/media-size";
import { execute, selectOne } from "@/server/db/pool";

export type MediaKind =
  | "original"
  | "mask"
  | "cutout"
  | "main"
  | "studio"
  | "lifestyle"
  | "banner"
  | "ig_jpeg"
  // the shop's brand kit setting photo, not tied to a listing
  | "brand"
  | LookKind
  // a 9:16 MP4 of one listing in one language
  | "reel";

export interface MediaRecord {
  id: string;
  kind: MediaKind;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

/** Longest side kept for originals (the browser shrinks first; this is the backstop). */
export const MAX_SIDE = 2048;

/**
 * Normalises an upload: applies the EXIF orientation, caps the size and re-encodes as
 * JPEG. sharp drops all metadata unless asked to keep it, so GPS and camera details
 * never reach disk. Throws on anything sharp can't decode.
 */
export async function normalisePhoto(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Writes a file under MEDIA_DIR/{workspace}/{yyyy-mm}/ and records it. The id is a
 * random UUID, which is also the file name, so paths are never built from user input.
 */
export async function saveMedia(
  workspaceId: string,
  kind: MediaKind,
  data: Buffer,
  meta: {
    mime: string;
    width: number;
    height: number;
    listingId?: string | null;
    sort?: number;
    /** The image this one was made from, for generated images. */
    fromMediaId?: string | null;
    /** Whether it goes to the store; a reel never does. Defaults to true, like the column. */
    selected?: boolean;
  },
): Promise<MediaRecord> {
  const id = randomUUID();
  const ext = meta.mime === "image/png" ? "png" : meta.mime === "video/mp4" ? "mp4" : "jpg";
  const rel = path.join(/*turbopackIgnore: true*/ workspaceId, new Date().toISOString().slice(0, 7), `${id}.${ext}`);
  const abs = path.join(/*turbopackIgnore: true*/ env().mediaDir, rel);
  await mkdir(path.dirname(/*turbopackIgnore: true*/ abs), { recursive: true });
  await writeFile(abs, data);
  await execute(
    "INSERT INTO media (id, workspace_id, kind, path, mime, bytes, width, height, listing_id, from_media_id, sort, selected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      workspaceId,
      kind,
      rel,
      meta.mime,
      data.length,
      meta.width,
      meta.height,
      meta.listingId ?? null,
      meta.fromMediaId ?? null,
      meta.sort ?? 0,
      meta.selected ?? true,
    ],
  );
  return { id, kind, mime: meta.mime, width: meta.width, height: meta.height, bytes: data.length };
}

/** Where a media file is on disk, but only if it belongs to the given workspace. */
async function locate(workspaceId: string, id: string): Promise<{ abs: string; mime: string } | null> {
  const row = await selectOne<{ path: string; mime: string }>(
    "SELECT path, mime FROM media WHERE id = ? AND workspace_id = ?",
    [id, workspaceId],
  );
  if (!row) return null;
  const root = env().mediaDir;
  const abs = path.resolve(/*turbopackIgnore: true*/ root, row.path);
  if (!abs.startsWith(root + path.sep)) return null; // stored paths are ours, but never trust a path
  return { abs, mime: row.mime };
}

/** Reads a media file, but only from the given workspace. */
export async function readMedia(workspaceId: string, id: string): Promise<{ data: Buffer; mime: string } | null> {
  const file = await locate(workspaceId, id);
  if (!file) return null;
  try {
    return { data: await readFile(file.abs), mime: file.mime };
  } catch {
    return null;
  }
}

/**
 * A smaller copy of an image, made on first request and kept beside the original. A list
 * of 48 px thumbnails otherwise downloads every 1200 px photo in full, which is slow on
 * phone data. WebP keeps a cutout's transparency at a fraction of the PNG's size.
 */
export async function readMediaSized(
  workspaceId: string,
  id: string,
  width: MediaWidth,
): Promise<{ data: Buffer; mime: string } | null> {
  const file = await locate(workspaceId, id);
  if (!file?.mime.startsWith("image/")) return null;
  const copy = `${file.abs}.w${width}.webp`;
  try {
    return { data: await readFile(copy), mime: "image/webp" };
  } catch {
    // not made yet
  }
  try {
    const data = await sharp(await readFile(file.abs))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    // a failed write only means the next request resizes again
    await writeFile(copy, data).catch(() => undefined);
    return { data, mime: "image/webp" };
  } catch {
    return null;
  }
}

export const mediaUrl = (id: string): string => `/media/${id}`;

/** For GET /api/health: the media folder exists (or can be made) and can be written. */
export async function mediaDirWritable(): Promise<boolean> {
  const root = env().mediaDir;
  try {
    await mkdir(/*turbopackIgnore: true*/ root, { recursive: true });
    await access(/*turbopackIgnore: true*/ root, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
