import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { colorSimilarity, productHistogram } from "./fidelity";

const square = (color: string, size = 100) =>
  sharp({ create: { width: size, height: size, channels: 3, background: color } })
    .jpeg()
    .toBuffer();

/** A product on white, the shape of our main images: a coloured square in a white frame. */
const onWhite = async (color: string) =>
  sharp({ create: { width: 200, height: 200, channels: 3, background: "#ffffff" } })
    .composite([{ input: await square(color), left: 50, top: 50 }])
    .png()
    .toBuffer();

describe("productHistogram and colorSimilarity", () => {
  it("scores the same colours as the same and different ones as different", async () => {
    const red = (await productHistogram(await onWhite("#b0201c")))!;
    const redAgain = (await productHistogram(await square("#b0201c", 300)))!;
    const navy = (await productHistogram(await onWhite("#1c2a5a")))!;
    expect(colorSimilarity(red, redAgain)).toBeGreaterThan(0.9);
    expect(colorSimilarity(red, navy)).toBeLessThan(0.1);
  });

  it("ignores the white background of a main image", async () => {
    const framed = (await productHistogram(await onWhite("#b0201c")))!;
    const bare = (await productHistogram(await square("#b0201c")))!;
    expect(colorSimilarity(framed, bare)).toBeGreaterThan(0.9);
  });

  it("counts only the opaque pixels of a transparent cutout", async () => {
    const cutout = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0 } },
    })
      .composite([{ input: await square("#b0201c", 50), left: 25, top: 25 }])
      .png()
      .toBuffer();
    const red = (await productHistogram(await square("#b0201c")))!;
    expect(colorSimilarity((await productHistogram(cutout))!, red)).toBeGreaterThan(0.9);
  });

  it("treats a fully opaque PNG on white as a main image, not a cutout", async () => {
    const opaque = await sharp(await onWhite("#b0201c"))
      .ensureAlpha()
      .png()
      .toBuffer();
    const red = (await productHistogram(await square("#b0201c")))!;
    expect(colorSimilarity((await productHistogram(opaque))!, red)).toBeGreaterThan(0.9);
  });

  it("says nothing when too little of the product is left", async () => {
    expect(await productHistogram(await square("#ffffff"))).toBeNull();
  });
});
