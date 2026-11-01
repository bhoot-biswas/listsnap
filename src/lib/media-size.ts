/**
 * Widths /media/[id] resizes images to: list thumbnails at 2×, tiles, the media library
 * grid, and a photo across a phone's screen. A short fixed list, so each size is made
 * once and kept on disk.
 */
export const MEDIA_WIDTHS = [96, 320, 640, 1280] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** A /media link for the image at `width`; anything else (a sample, a local preview) is left alone. */
export function sized(url: string, width: MediaWidth): string {
  return url.startsWith("/media/") ? `${url}${url.includes("?") ? "&" : "?"}w=${width}` : url;
}

/**
 * Every size of a /media image for `srcSet`, so the browser fetches the smallest that is
 * sharp at the size it draws and the screen's density; null for any other link.
 */
export function mediaSrcSet(url: string): string | null {
  if (!url.startsWith("/media/")) return null;
  return MEDIA_WIDTHS.map((w) => `${sized(url, w)} ${w}w`).join(", ");
}
