import "server-only";
import { boxOverlap as overlap } from "@/server/image-ops";
import type { SegmentInstance } from "@/server/providers/types";

/** Contents whose box shares this much of the product's belong to it. */
const OVERLAP = 0.2;

/**
 * SAM finds one kind of thing per phrase, so a cup on its saucer comes back as a saucer
 * for "blue cup saucer" and as a cup for "coffee cup". A set is sold as one bundle, so
 * every phrase runs and every piece touching another joins it, through any chain of
 * touching pieces, into one item whose mask is the union of theirs. Joining only the
 * pieces that overlap a lot left a cluster of clay pots with bites where a pot in front,
 * left out, covered the ones behind. Pieces lying apart stay separate items, for the
 * group step.
 */
export function mergeSetPieces(found: SegmentInstance[]): SegmentInstance[] {
  const parent = found.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let i = 0; i < found.length; i++)
    for (let j = i + 1; j < found.length; j++)
      if (overlap(found[i]!.box, found[j]!.box) > 0) parent[root(j)] = root(i);

  const groups = new Map<number, SegmentInstance[]>();
  found.forEach((inst, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), inst]));
  return [...groups.values()].map((g) => (g.length === 1 ? g[0]! : union(g)));
}

/**
 * A pair sold as one product (two earrings, two sandals) becomes one item, so its photos
 * show both pieces rather than whichever came first.
 */
export function joinPieces(pieces: SegmentInstance[]): SegmentInstance {
  return union(pieces);
}

/**
 * What sits in or on a product (the coffee in a cup) joins the product it overlaps most,
 * so the cutout keeps it instead of a hole where SAM's product mask stopped. Contents that
 * overlap no product are dropped: they are never items of their own. Products are not
 * merged with each other here; a shop shelf of touching items stays separate.
 */
export function addContents(products: SegmentInstance[], contents: SegmentInstance[]): SegmentInstance[] {
  const extra = products.map((): SegmentInstance[] => []);
  for (const c of contents) {
    let best = -1;
    let most = OVERLAP;
    products.forEach((p, i) => {
      const o = overlap(p.box, c.box);
      if (o >= most) [best, most] = [i, o];
    });
    if (best >= 0) extra[best]!.push(c);
  }
  // the product's own score stays: a confident "latte" says nothing about the cup
  return products.map((p, i) => (extra[i]!.length ? { ...union([p, ...extra[i]!]), score: p.score } : p));
}

function union(pieces: SegmentInstance[]): SegmentInstance {
  const x = Math.round(Math.min(...pieces.map((p) => p.box.x)));
  const y = Math.round(Math.min(...pieces.map((p) => p.box.y)));
  const w = Math.round(Math.max(...pieces.map((p) => p.box.x + p.box.w))) - x;
  const h = Math.round(Math.max(...pieces.map((p) => p.box.y + p.box.h))) - y;
  const scores = pieces.map((p) => p.score).filter((s): s is number => s !== null);
  const merged: SegmentInstance = { box: { x, y, w, h }, score: scores.length ? Math.max(...scores) : null };
  if (!pieces.some((p) => p.mask)) return merged;

  // full resolution over the union box, each piece's (possibly scaled-down) mask sampled into it
  const raster = new Uint8Array(w * h);
  for (const p of pieces) {
    const left = Math.round(p.box.x) - x;
    const top = Math.round(p.box.y) - y;
    const pw = Math.min(w - left, Math.round(p.box.w));
    const ph = Math.min(h - top, Math.round(p.box.h));
    for (let py = 0; py < ph; py++) {
      const row = (top + py) * w + left;
      for (let px = 0; px < pw; px++) {
        // a piece without a mask counts as its whole box
        const on = p.mask
          ? p.mask.raster[
              Math.min(p.mask.height - 1, Math.floor((py * p.mask.height) / ph)) * p.mask.width +
                Math.min(p.mask.width - 1, Math.floor((px * p.mask.width) / pw))
            ]
          : 1;
        if (on) raster[row + px] = 1;
      }
    }
  }
  return { ...merged, mask: { raster, width: w, height: h } };
}
