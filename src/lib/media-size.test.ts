import { describe, expect, it } from "vitest";
import { mediaSrcSet, sized } from "./media-size";

describe("media sizes", () => {
  it("offers every kept size of a /media image, keeping a signed link's query", () => {
    expect(mediaSrcSet("/media/abc")).toBe(
      "/media/abc?w=96 96w, /media/abc?w=320 320w, /media/abc?w=640 640w, /media/abc?w=1280 1280w",
    );
    expect(sized("/media/abc?s=x&e=1", 320)).toBe("/media/abc?s=x&e=1&w=320");
  });

  it("leaves other links alone: a photo still on the phone, a sample", () => {
    expect(mediaSrcSet("blob:http://x/1")).toBeNull();
    expect(sized("/samples/saree.jpg", 96)).toBe("/samples/saree.jpg");
  });
});
