import "server-only";
import type { Box } from "@/server/image-ops";
import type { SegmentInstance } from "@/server/providers/types";

/** Pieces whose boxes share this much of the smaller one are parts of one thing. */
const OVERLAP = 0.2;

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

/**
 * SAM finds one kind of thing per phrase, so a cup on its saucer comes back as a saucer
 * for "blue cup saucer" and as a cup for "coffee cup". For a set, every phrase runs and
 * pieces that overlap become one item, its mask the union of theirs; the same piece found
 * by two phrases collapses the same way. Pieces lying apart stay separate items, for the
 * group step to sort out.
 */
export function mergeSetPieces(found: SegmentInstance[]): SegmentInstance[] {
  const parent = found.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let i = 0; i < found.length; i++)
    for (let j = i + 1; j < found.length; j++)
      if (overlap(found[i]!.box, found[j]!.box) >= OVERLAP) parent[root(j)] = root(i);

  const groups = new Map<number, SegmentInstance[]>();
  found.forEach((inst, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), inst]));
  return [...groups.values()].map((g) => (g.length === 1 ? g[0]! : union(g)));
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
