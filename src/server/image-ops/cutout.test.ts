import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fillOccluders, hasAlpha, maskCutout } from "./cutout";

const photo = () =>
  sharp({ create: { width: 100, height: 80, channels: 3, background: "#c0392b" } })
    .jpeg()
    .toBuffer();

describe("maskCutout", () => {
  it("stretches a scaled-down mask over its box and trims to what it covers", async () => {
    // a 10×10 raster for a 40×40 box: only the left half is the product
    const raster = new Uint8Array(100);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) raster[y * 10 + x] = 1;
    const png = await maskCutout(await photo(), { x: 20, y: 20, w: 40, h: 40 }, { raster, width: 10, height: 10 });
    const meta = await sharp(png).metadata();
    expect(await hasAlpha(png)).toBe(true);
    expect(meta.height).toBeGreaterThanOrEqual(38);
    // half of the 40 px box, plus a pixel or two of feathered edge
    expect(meta.width).toBeGreaterThanOrEqual(19);
    expect(meta.width).toBeLessThanOrEqual(24);
  });

  it("refuses an empty mask", async () => {
    await expect(
      maskCutout(await photo(), { x: 0, y: 0, w: 10, h: 10 }, { raster: new Uint8Array(100), width: 10, height: 10 }),
    ).rejects.toThrow(/Empty mask/);
  });
});

describe("fillOccluders", () => {
  // a 9×9 box: a product ring of mask around a 3×3 hole in the middle, background in the corners
  const scene = (holeColour: [number, number, number]) => {
    const w = 9;
    const mask = new Uint8Array(w * w);
    const rgb = new Uint8Array(w * w * 3).fill(200); // light-grey background
    for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) mask[y * w + x] = 255;
    for (let y = 3; y < 6; y++)
      for (let x = 3; x < 6; x++) {
        mask[y * w + x] = 0;
        rgb.set(holeColour, (y * w + x) * 3);
      }
    return { mask, rgb, w };
  };

  it("puts back something lying on the product (a tea tag)", () => {
    const { mask, rgb, w } = scene([230, 200, 30]);
    fillOccluders(mask, rgb, w, w);
    expect(mask[4 * w + 4]).toBe(255);
  });

  it("keeps a real gap that shows the background (a mug handle, a bangle)", () => {
    const { mask, rgb, w } = scene([195, 200, 205]);
    fillOccluders(mask, rgb, w, w);
    expect(mask[4 * w + 4]).toBe(0);
  });
});
