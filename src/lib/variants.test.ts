import { describe, expect, it } from "vitest";
import { listingVariants, Variants } from "./variants";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const items = [
  { id: A, color: "Maroon" },
  { id: B, color: null },
];

describe("listingVariants", () => {
  it("is null unless the listing is one design in several colours", () => {
    expect(listingVariants("separate", [A, B], items, null)).toBeNull();
    expect(listingVariants("variants", [A], items, null)).toBeNull();
  });

  it("starts from Spark's colour names, numbering the unnamed", () => {
    expect(listingVariants("variants", [A, B], items, null)?.map((v) => v.color)).toEqual(["Maroon", "Color 2"]);
  });

  it("keeps saved edits for items still in the listing and fills the rest", () => {
    const saved = [
      { itemId: B, color: "Navy", priceBdt: 900, stockQty: 3, on: false },
      { itemId: "33333333-3333-4333-8333-333333333333", color: "Gone", priceBdt: null, stockQty: null, on: true },
    ];
    const v = listingVariants("variants", [A, B], items, saved)!;
    expect(v.map((x) => [x.color, x.on])).toEqual([
      ["Maroon", true],
      ["Navy", false],
    ]);
  });
});

describe("Variants", () => {
  const row = (itemId: string, color: string, on = true) => ({ itemId, color, priceBdt: null, stockQty: null, on });

  it("needs one colour on and distinct names among those on", () => {
    expect(Variants.safeParse([row(A, "Red", false), row(B, "Blue", false)]).success).toBe(false);
    expect(Variants.safeParse([row(A, "Red"), row(B, "red")]).success).toBe(false);
    expect(Variants.safeParse([row(A, "Red"), row(B, "red", false)]).success).toBe(true);
  });
});
