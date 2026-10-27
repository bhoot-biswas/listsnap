import "server-only";
import sharp from "sharp";
import type { Box } from "./types";

export type { Box } from "./types";

/**
 * All pixel work behind one module, so a fallback can replace sharp
 * if Hostinger can't load it. Phase 1 has what the mock pipeline needs: crops, a white
 * main image, a photo check and composites. Mask → alpha arrives with live SAM (Phase 3).
 */

/** Main image size for the store: square, white, product centred (WooCommerce default ratio). */
export const MAIN_SIZE = 1200;

/** Crops a box out of the photo, clamped to its edges. */
export async function crop(photo: Buffer, box: Box): Promise<{ data: Buffer; width: number; height: number }> {
  const meta = await sharp(photo).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const left = Math.max(0, Math.min(W - 1, Math.round(box.x)));
  const top = Math.max(0, Math.min(H - 1, Math.round(box.y)));
  const width = Math.max(1, Math.min(W - left, Math.round(box.w)));
  const height = Math.max(1, Math.min(H - top, Math.round(box.h)));
  const data = await sharp(photo).extract({ left, top, width, height }).png().toBuffer();
  return { data, width, height };
}

/** Places a product image centred on a white square, with a margin, as a JPEG. */
export async function whiteMain(product: Buffer, size = MAIN_SIZE): Promise<Buffer> {
  const inner = Math.round(size * 0.86);
  const fitted = await sharp(product).resize(inner, inner, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .composite([{ input: fitted, gravity: "centre" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

export interface PhotoCheck {
  fillPercent: number;
  sharp: boolean;
  exposure: "dark" | "ok" | "bright";
  hints: string[];
}

/**
 * The retake hint. Fill is the share of the frame the found items cover
 * (all of them, so a neat row of products isn't called "too small"); sharpness is the
 * spread of a Laplacian-filtered greyscale; exposure is mean luma. Thresholds are from
 * the Phase 0a run on 21 photos.
 */
export async function photoCheck(photo: Buffer, boxes: Box[]): Promise<PhotoCheck> {
  const meta = await sharp(photo).metadata();
  const area = (meta.width ?? 1) * (meta.height ?? 1);
  const covered = boxes.reduce((s, b) => s + b.w * b.h, 0);
  const fillPercent = Math.min(100, Math.round((covered / area) * 100));

  const small = sharp(photo).greyscale().resize(512, 512, { fit: "inside" });
  const { channels } = await small.clone().stats();
  const luma = channels[0]?.mean ?? 128;
  const edges = await small
    .clone()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .stats();
  const sharpness = edges.channels[0]?.stdev ?? 0;

  const exposure = luma < 60 ? "dark" : luma > 215 ? "bright" : "ok";
  const isSharp = sharpness >= 6;
  const hints: string[] = [];
  if (fillPercent < 25) hints.push("too_small");
  if (!isSharp) hints.push("blurry");
  if (exposure === "dark") hints.push("too_dark");
  if (exposure === "bright") hints.push("too_bright");
  return { fillPercent, sharp: isSharp, exposure, hints };
}

/** A product composited onto a background, with a soft shadow under it. */
export async function compositeOnBackground(
  background: Buffer,
  product: Buffer,
  opts: { width: number; height: number; scale?: number; shadow: "drop" | "contact" },
): Promise<Buffer> {
  const { width, height, scale = 0.7 } = opts;
  const bg = await sharp(background).resize(width, height, { fit: "cover" }).png().toBuffer();
  const p = await sharp(product)
    .resize(Math.round(width * scale), Math.round(height * scale), { fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((width - p.info.width) / 2);
  const top =
    opts.shadow === "drop"
      ? Math.round((height - p.info.height) / 2)
      : Math.max(0, Math.round(height * 0.86 - p.info.height));
  const rx = Math.round(p.info.width * 0.45);
  const ry = Math.max(8, Math.round(p.info.height * (opts.shadow === "drop" ? 0.5 : 0.06)));
  const cy = opts.shadow === "drop" ? top + p.info.height / 2 + ry * 0.08 : top + p.info.height;
  const shadowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${left + p.info.width / 2 + 6}" cy="${cy}" rx="${rx}" ry="${ry}" fill="black" fill-opacity="0.22"/></svg>`;
  const shadow = await sharp(Buffer.from(shadowSvg)).blur(18).png().toBuffer();
  return sharp(bg)
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: p.data, left, top },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/** A flat colour gradient, used by the mock renderer and as the banner base. */
export async function gradient(width: number, height: number, from: string, to: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function dimensions(img: Buffer): Promise<{ width: number; height: number }> {
  const m = await sharp(img).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}
