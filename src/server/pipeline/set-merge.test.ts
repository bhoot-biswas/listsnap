import { describe, expect, it } from "vitest";
import { addContents, mergeSetPieces } from "./set-merge";

const full = (w: number, h: number) => ({ raster: new Uint8Array(w * h).fill(1), width: w, height: h });

describe("mergeSetPieces", () => {
  it("joins a cup and the saucer under it into one item with both masks", () => {
    const cup = { box: { x: 30, y: 0, w: 40, h: 60 }, score: 0.79, mask: full(20, 30) };
    const saucer = { box: { x: 0, y: 40, w: 100, h: 40 }, score: 0.96, mask: full(100, 40) };
    const [item, ...rest] = mergeSetPieces([saucer, cup]);
    expect(rest).toHaveLength(0);
    expect(item!.box).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    expect(item!.score).toBe(0.96);
    const { raster, width } = item!.mask!;
    expect(raster[10 * width + 50]).toBe(1); // the cup, above the saucer
    expect(raster[10 * width + 5]).toBe(0); // beside the cup, above the saucer: background
    expect(raster[70 * width + 5]).toBe(1); // the saucer's rim
  });

  it("collapses the same piece found by two phrases", () => {
    const a = { box: { x: 10, y: 10, w: 50, h: 50 }, score: 0.9 };
    const b = { box: { x: 12, y: 11, w: 48, h: 49 }, score: 0.8 };
    expect(mergeSetPieces([a, b])).toHaveLength(1);
  });

  it("keeps pieces lying apart as separate items", () => {
    const left = { box: { x: 0, y: 0, w: 40, h: 40 }, score: 0.9, mask: full(40, 40) };
    const right = { box: { x: 60, y: 0, w: 40, h: 40 }, score: 0.9, mask: full(40, 40) };
    expect(mergeSetPieces([left, right])).toEqual([left, right]);
  });
});

describe("addContents", () => {
  it("fills the cup with its coffee and keeps the cup's score", () => {
    // the cup's mask stops at the rim: its top 10 rows are empty
    const raster = new Uint8Array(40 * 40).fill(1);
    raster.fill(0, 0, 40 * 10);
    const cup = { box: { x: 0, y: 0, w: 40, h: 40 }, score: 0.86, mask: { raster, width: 40, height: 40 } };
    const coffee = { box: { x: 5, y: 0, w: 30, h: 12 }, score: 0.98, mask: full(30, 12) };
    const [item, ...rest] = addContents([cup], [coffee]);
    expect(rest).toHaveLength(0);
    expect(item!.score).toBe(0.86);
    expect(item!.box).toEqual(cup.box);
    expect(item!.mask!.raster[5 * 40 + 20]).toBe(1); // the coffee
    expect(item!.mask!.raster[5 * 40 + 2]).toBe(0); // beside it, above the rim
  });

  it("drops contents that touch no product and never merges products", () => {
    const a = { box: { x: 0, y: 0, w: 40, h: 40 }, score: 0.9 };
    const b = { box: { x: 30, y: 0, w: 40, h: 40 }, score: 0.9 };
    const stray = { box: { x: 200, y: 200, w: 10, h: 10 }, score: 0.9 };
    expect(addContents([a, b], [stray])).toEqual([a, b]);
  });
});
