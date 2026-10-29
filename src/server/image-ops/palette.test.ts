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
