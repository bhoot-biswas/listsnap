import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hasAlpha, maskCutout } from "./cutout";

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
