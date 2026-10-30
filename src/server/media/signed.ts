import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/**
 * Short-lived links to one media file, for services that must download it themselves
 * (WooCommerce sideloads product images; Facebook and Instagram fetch reels). /media stays private:
 * a link works only for the file and workspace it was made for, until it expires.
 * The path ends in .jpg/.png because WordPress decides the file type from the URL.
 */

const DEFAULT_TTL_S = 15 * 60;

const signature = (workspaceId: string, mediaId: string, expires: number) =>
  createHmac("sha256", `${env().authSecret}:media-link`)
    .update(`${workspaceId}.${mediaId}.${expires}`)
    .digest("base64url");

export function signedMediaUrl(workspaceId: string, mediaId: string, mime: string, ttlSeconds = DEFAULT_TTL_S): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const ext = mime === "image/png" ? "png" : mime === "video/mp4" ? "mp4" : "jpg";
  const q = new URLSearchParams({ w: workspaceId, e: String(expires), s: signature(workspaceId, mediaId, expires) });
  return `${env().mediaFetchBaseUrl}/media/${mediaId}.${ext}?${q}`;
}

/** The workspace a signed link was made for, or null if it is forged, altered or expired. */
export function verifyMediaLink(mediaId: string, params: URLSearchParams, now = Date.now()): string | null {
  const workspaceId = params.get("w");
  const expires = Number(params.get("e"));
  const sig = params.get("s");
  if (!workspaceId || !sig || !Number.isInteger(expires) || expires * 1000 < now) return null;
  const want = Buffer.from(signature(workspaceId, mediaId, expires));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? workspaceId : null;
}
