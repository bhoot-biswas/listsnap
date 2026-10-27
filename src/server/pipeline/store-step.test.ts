import { describe, expect, it } from "vitest";
import { suggestedPrice } from "./store-step";

describe("suggestedPrice", () => {
  it("takes the middle of the range, rounded the shop's way", () => {
    expect(suggestedPrice({ low: 2800, high: 6500 }, 10)).toBe(4650);
    expect(suggestedPrice({ low: 180, high: 350 }, 50)).toBe(250);
    expect(suggestedPrice({ low: 650, high: 1200 }, 0)).toBe(925);
  });

  it("gives no price for a range that makes no sense", () => {
    expect(suggestedPrice({ low: 0, high: 0 }, 10)).toBeNull();
    expect(suggestedPrice({ low: 900, high: 400 }, 10)).toBeNull();
  });
});
