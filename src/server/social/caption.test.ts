import { describe, expect, it } from "vitest";
import { CAPTION_MAX } from "@/lib/schemas/social";
import { defaultCaption } from "./caption";

describe("default caption", () => {
  it("is built from the listing: title, short description, price, the ask and hashtags", () => {
    const c = defaultCaption({
      lang: "en",
      title: "Red Jamdani Saree",
      shortDescription: "Soft cotton with a gold border.",
      priceBdt: 4000,
      tags: ["jamdani saree", "red saree", "Red Saree", "eid-gift!"],
    });
    expect(c).toBe(
      "Red Jamdani Saree\n\nSoft cotton with a gold border.\n\nPrice: ৳4,000\n\nMessage us to order.\n\n#jamdanisaree #redsaree #RedSaree #eidgift",
    );
  });

  it("keeps Bangla tags whole and writes the price in Bangla digits", () => {
    const c = defaultCaption({
      lang: "bn",
      title: "লাল শাড়ি",
      shortDescription: "",
      priceBdt: 1250,
      tags: ["লাল শাড়ি"],
    });
    expect(c).toBe("লাল শাড়ি\n\nদাম: ৳১,২৫০\n\nঅর্ডার করতে মেসেজ করুন।\n\n#লালশাড়ি");
  });

  it("leaves out a missing price and stays within Instagram's limit", () => {
    const c = defaultCaption({ lang: "en", title: "x".repeat(3000), shortDescription: "", priceBdt: null, tags: [] });
    expect(c.length).toBe(CAPTION_MAX);
    expect(c).not.toContain("Price");
  });
});
