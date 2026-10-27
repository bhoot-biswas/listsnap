import "server-only";
import sharp from "sharp";
import type { Box } from "./types";

/**
 * A transparent cutout of one SAM instance. Only the instance's box is processed: the
 * mask raster covers exactly that box (SAM may send it scaled down, long side ≤ 1024),
 * so it is stretched back to the box, feathered a little so the edge doesn't look
 * stencilled, and used as the alpha channel. The result is trimmed to the mask.
 */
export async function maskCutout(
  photo: Buffer,
  box: Box,
  mask: { raster: Uint8Array; width: number; height: number },
  feather = 1.2,
): Promise<Buffer> {
  const meta = await sharp(photo).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const left = Math.max(0, Math.min(W - 1, Math.round(box.x)));
  const top = Math.max(0, Math.min(H - 1, Math.round(box.y)));
  const bw = Math.max(1, Math.min(W - left, Math.round(box.w)));
  const bh = Math.max(1, Math.min(H - top, Math.round(box.h)));

  // nearest-neighbour by hand: exact when the sizes match, no resampling surprises when they don't
  const alphaRaw = Buffer.alloc(bw * bh);
  for (let y = 0; y < bh; y++) {
    const sy = Math.min(mask.height - 1, Math.floor((y * mask.height) / bh));
    for (let x = 0; x < bw; x++) {
      const sx = Math.min(mask.width - 1, Math.floor((x * mask.width) / bw));
      if (mask.raster[sy * mask.width + sx]) alphaRaw[y * bw + x] = 255;
    }
  }
  const rgb = await sharp(photo)
    .extract({ left, top, width: bw, height: bh })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer();
  fillOccluders(alphaRaw, rgb, bw, bh);
  // sharp widens one raw channel to sRGB when blurring, so take channel 0 back out
  const alpha = await sharp(alphaRaw, { raw: { width: bw, height: bh, channels: 1 } })
    .blur(feather)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const rgba = Buffer.alloc(bw * bh * 4);
  let minX = bw;
  let minY = bh;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < bw * bh; i++) {
    rgba[i * 4] = rgb[i * 3]!;
    rgba[i * 4 + 1] = rgb[i * 3 + 1]!;
    rgba[i * 4 + 2] = rgb[i * 3 + 2]!;
    rgba[i * 4 + 3] = alpha[i]!;
    if (alpha[i]! > 8) {
      const x = i % bw;
      const y = (i - x) / bw;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("Empty mask: nothing to cut out");
  // sharp's trim() compares colour too, so crop to the mask's own bounds instead
  return sharp(rgba, { raw: { width: bw, height: bh, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
}

/** True when the image carries transparency (a real cutout, not a rectangular crop). */
export async function hasAlpha(img: Buffer): Promise<boolean> {
  return !!(await sharp(img).metadata()).hasAlpha;
}

/** How far (RGB distance) a hole's colour must be from the background to count as in front of the product. */
const OCCLUDER_DISTANCE = 60;

/**
 * SAM masks only what the phrase names, so whatever lies on the product (a tea tag on
 * a "pink mug", a price sticker) comes back as a hole, and the cutout would show the
 * product with a piece missing. A hole that looks like the background around the
 * product is a real gap (inside a mug handle, the middle of a bangle) and stays
 * transparent; one that doesn't is something in front of the product, and is put back,
 * so the cutout matches the photo. Works in place on the 0/255 mask.
 */
export function fillOccluders(mask: Uint8Array, rgb: Uint8Array, width: number, height: number): void {
  const n = width * height;
  const label = new Int32Array(n).fill(-1);
  const regions: { touchesEdge: boolean; count: number; sum: [number, number, number] }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (mask[start] || label[start]! >= 0) continue;
    const region = { touchesEdge: false, count: 0, sum: [0, 0, 0] as [number, number, number] };
    const id = regions.push(region) - 1;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      region.count++;
      region.sum[0] += rgb[p * 3]!;
      region.sum[1] += rgb[p * 3 + 1]!;
      region.sum[2] += rgb[p * 3 + 2]!;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) region.touchesEdge = true;
      const next = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const q of next) {
        if (q >= 0 && !mask[q] && label[q]! < 0) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
  }

  // the background is what surrounds the product inside its box: the regions open to the edge
  const outside = regions.filter((r) => r.touchesEdge);
  const total = outside.reduce((s, r) => s + r.count, 0);
  if (!total) return;
  const bg = [0, 1, 2].map((c) => outside.reduce((s, r) => s + r.sum[c]!, 0) / total);
  const fill = regions.map(
    (r) => !r.touchesEdge && Math.hypot(...[0, 1, 2].map((c) => r.sum[c]! / r.count - bg[c]!)) > OCCLUDER_DISTANCE,
  );
  if (!fill.some(Boolean)) return;
  for (let i = 0; i < n; i++) if (!mask[i] && fill[label[i]!]) mask[i] = 255;
}
