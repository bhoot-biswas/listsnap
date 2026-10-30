import { describe, expect, it } from "vitest";
import { bulkCost } from "./bulk-cost";

describe("bulk upload cost", () => {
  it("counts a listing and its scenes per photo", () => {
    expect(bulkCost({ photos: 5, scenesPerListing: 2, imagesLeft: 40 })).toEqual({
      listings: 5,
      aiPhotos: 10,
      withoutPhotos: 0,
    });
  });

  it("says how many listings will wait for their photos", () => {
    // 7 photos left covers 3 listings of 2 scenes; the other 9 wait
    expect(bulkCost({ photos: 12, scenesPerListing: 2, imagesLeft: 7 }).withoutPhotos).toBe(9);
    expect(bulkCost({ photos: 3, scenesPerListing: 1, imagesLeft: 0 }).withoutPhotos).toBe(3);
  });

  it("costs nothing when the shop makes no scenes automatically", () => {
    expect(bulkCost({ photos: 4, scenesPerListing: 0, imagesLeft: 0 })).toEqual({
      listings: 4,
      aiPhotos: 0,
      withoutPhotos: 0,
    });
  });
});
