import "server-only";
import { maskCutout } from "@/server/image-ops/cutout";
import { colorSimilarity, productHistogram } from "@/server/image-ops/fidelity";
import { meta } from "@/server/providers";
import type { CallContext } from "@/server/providers/types";
import type { ProductMatch } from "@/lib/schemas/pipeline";

/**
 * Does an AI photo still show the seller's product? Every image that redraws the product
 * passes through here before it is kept, because the buyer receives the item, not the photo.
 *
 * 1. SAM finds the product in the new image with the phrase that found it in the photo.
 * 2. Its own pixels are compared with the cutout's colours. In calibration the right
 *    product scored 0.85–0.97 and the wrong one 0.03–0.14, so below the floor is a fail
 *    without asking a model.
 * 3. Muse Spark compares the two images for pattern, motifs and details, which colours
 *    can't see (a red saree with its gold buttis redrawn as silver paisleys).
 */

export const COLOR_FLOOR = 0.6;

export interface Fidelity {
  same: boolean;
  colorSimilarity: number | null;
  /** For the seller when it isn't the same product; empty otherwise. */
  differences: string;
}

/** The rule, apart from the calls, so it can be read and tested on its own. */
export function decide(input: {
  found: boolean;
  similarity: number | null;
  judge: (() => Promise<ProductMatch>) | null;
}): Promise<Fidelity> | Fidelity {
  const { found, similarity } = input;
  if (!found) return { same: false, colorSimilarity: null, differences: "the product couldn't be found in the photo" };
  if (similarity !== null && similarity < COLOR_FLOOR)
    return { same: false, colorSimilarity: similarity, differences: "its colours don't match your photo" };
  if (!input.judge) return { same: true, colorSimilarity: similarity, differences: "" };
  return input.judge().then((m) => ({
    same: m.same,
    colorSimilarity: similarity,
    differences: m.same ? "" : m.differences.replace(/\s+/g, " ").trim().slice(0, 140),
  }));
}

export async function checkFidelity(
  ctx: CallContext,
  reference: Buffer,
  candidate: Buffer,
  phrase: string,
): Promise<Fidelity> {
  const found = await meta().segment(ctx, candidate, phrase);
  const best = found.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0];
  let similarity: number | null = null;
  // colours are only comparable on the product's own pixels: without a mask (mock SAM) a
  // box crop is mostly background, so the model judge decides alone
  if (best?.mask) {
    const product = await maskCutout(candidate, best.box, best.mask);
    const [ref, got] = await Promise.all([productHistogram(reference), productHistogram(product)]);
    similarity = ref && got ? colorSimilarity(ref, got) : null;
  }
  return decide({
    found: !!best,
    similarity,
    judge: () => meta().compareProduct(ctx, reference, candidate, phrase),
  });
}
