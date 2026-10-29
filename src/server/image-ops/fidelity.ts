import "server-only";
import sharp from "sharp";

/**
 * A cheap, deterministic first check that an AI image still shows the seller's product:
 * do the product's own pixels have the same colours as the cutout? It can't see a changed
 * motif or a missing button (the model judge does that), but a red saree that came back
 * maroon, or the wrong item, shows up here at no model cost.
 */

const BINS = 8; // per channel: 512 colour boxes, coarse enough to ignore lighting shifts
const SIDE = 192;
const MIN_PIXELS = 200;

/**
 * The colour distribution of a product image's own pixels. A cutout with transparency
 * counts only its opaque pixels; a white main image (opaque, with or without alpha) drops
 * its near-white background. Null when too little of the product is left to say anything.
 */
export async function productHistogram(img: Buffer): Promise<Float64Array | null> {
  const data = await sharp(img).resize(SIDE, SIDE, { fit: "inside" }).ensureAlpha().raw().toBuffer();
  // an alpha channel only marks the product if something is actually transparent; a fully
  // opaque PNG on white is a main image, whose white background must be left out
  let transparent = false;
  for (let i = 3; i < data.length && !transparent; i += 4) transparent = data[i]! < 128;
  const hist = new Float64Array(BINS ** 3);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (transparent ? a < 128 : r > 238 && g > 238 && b > 238) continue;
    const k = ((r * BINS) >> 8) * BINS * BINS + ((g * BINS) >> 8) * BINS + ((b * BINS) >> 8);
    hist[k]! += 1;
    n++;
  }
  if (n < MIN_PIXELS) return null;
  for (let k = 0; k < hist.length; k++) hist[k]! /= n;
  return hist;
}

/** Bhattacharyya coefficient of two colour distributions: 1 is identical, 0 shares nothing. */
export function colorSimilarity(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += Math.sqrt(a[k]! * b[k]!);
  return Math.round(s * 1000) / 1000;
}
