import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fillsFrame, photoCheck, squarePhoto } from "./index";

const photo = () =>
  sharp({ create: { width: 200, height: 100, channels: 3, background: "#c0392b" } })
    .jpeg()
    .toBuffer();

describe("fillsFrame", () => {
  it("is true only when the box covers nearly the whole photo", () => {
    expect(fillsFrame({ x: 0, y: 0, w: 200, h: 100 }, 200, 100)).toBe(true);
    expect(fillsFrame({ x: 2, y: 2, w: 196, h: 95 }, 200, 100)).toBe(true);
    expect(fillsFrame({ x: 20, y: 10, w: 160, h: 80 }, 200, 100)).toBe(false);
  });
});

describe("photoCheck", () => {
  it("asks the seller to step back when an item fills the frame", async () => {
    const check = await photoCheck(await photo(), [{ x: 0, y: 0, w: 200, h: 100 }]);
    expect(check.hints).toContain("too_close");
  });

  it("flags kurtis laid over each other, with the outer ones running off the edges", async () => {
    // four side by side, each lying a little over the next, as in a crowded flat lay
    const boxes = [0, 45, 90, 135].map((x) => ({ x, y: 20, w: 65, h: 70 }));
    const check = await photoCheck(await photo(), boxes);
    expect(check.hints).toEqual(expect.arrayContaining(["cut_off", "overlap"]));
    expect(check.hints).not.toContain("too_close");
  });

  it("does not call items apart from each other overlapping", async () => {
    const boxes = [10, 110].map((x) => ({ x, y: 20, w: 80, h: 60 }));
    const check = await photoCheck(await photo(), boxes);
    expect(check.hints).not.toContain("overlap");
    expect(check.hints).not.toContain("cut_off");
  });

  it("does not add cut-off to an item that fills the frame", async () => {
    const check = await photoCheck(await photo(), [{ x: 0, y: 0, w: 200, h: 100 }]);
    expect(check.hints).not.toContain("cut_off");
  });

  it("says nothing about distance for an item with room around it", async () => {
    const check = await photoCheck(await photo(), [{ x: 40, y: 20, w: 120, h: 60 }]);
    expect(check.hints).not.toContain("too_close");
    expect(check.hints).not.toContain("too_small");
  });
});

describe("squarePhoto", () => {
  it("centre-crops the photo to an opaque square", async () => {
    const meta = await sharp(await squarePhoto(await photo(), 256)).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(meta.hasAlpha).toBe(false);
  });
});
