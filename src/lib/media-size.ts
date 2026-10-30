/**
 * Widths /media/[id] resizes images to: list thumbnails at 2×, tiles, the media library
 * grid. A short fixed list, so each size is made once and kept on disk.
 */
export const MEDIA_WIDTHS = [96, 320, 640] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** A /media link for the image at `width`; anything else (a sample, a local preview) is left alone. */
export function sized(url: string, width: MediaWidth): string {
  return url.startsWith("/media/") ? `${url}${url.includes("?") ? "&" : "?"}w=${width}` : url;
}
