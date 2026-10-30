import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { paletteSwatch } from "./index";

describe("paletteSwatch", () => {
  it("draws one equal band per brand colour", async () => {
    const png = await paletteSwatch(["#FF0000", "#00FF00", "#0000FF"], 300);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number) => [...data.subarray((150 * info.width + x) * 3, (150 * info.width + x) * 3 + 3)];
    expect([info.width, info.height]).toEqual([300, 300]);
    expect(at(50)).toEqual([255, 0, 0]);
    expect(at(150)).toEqual([0, 255, 0]);
    expect(at(250)).toEqual([0, 0, 255]);
  });

  it("ignores anything that isn't a hex colour", async () => {
    const png = await paletteSwatch(["#FF0000", '"/><script>', "red"], 100);
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...data.subarray(data.length - 3)]).toEqual([255, 0, 0]);
  });
});

describe("compositeOnBackground placement", () => {
  it("can sit the product right of centre, inside the frame", async () => {
    const { compositeOnBackground } = await import("./index");
    const bg = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#ffffff" } })
      .png()
      .toBuffer();
    const product = await sharp({ create: { width: 50, height: 50, channels: 4, background: "#ff0000" } })
      .png()
      .toBuffer();
    const out = await compositeOnBackground(bg, product, {
      width: 400,
      height: 200,
      scale: 0.25,
      centerX: 0.75,
      shadow: "drop",
    });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const redAt = (x: number) => data[(100 * info.width + x) * 3]! > 200 && data[(100 * info.width + x) * 3 + 1]! < 80;
    expect(redAt(300)).toBe(true);
    expect(redAt(100)).toBe(false);
  });
});
