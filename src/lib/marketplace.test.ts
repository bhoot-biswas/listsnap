import { describe, expect, it } from "vitest";
import { MarketplaceLink, marketplaceCategory, marketplaceFields } from "./marketplace";

/** What the Marketplace card and the export kit put in each box of Marketplace's form. */

const text = {
  title: "  Red Zari Saree  ",
  shortDescription: "Bright red saree.",
  description: "Soft art silk.",
  attributes: [
    { name: "Border", value: "Gold zari" },
    { name: "", value: "dropped" },
  ],
  tags: [" red saree ", "", "zari"],
};

describe("marketplaceFields", () => {
  it("fills each box the way Marketplace takes it", () => {
    const f = marketplaceFields(text, { price: 2650, category: "Sarees", colours: [], coloursLabel: "Colours" });
    expect(f).toEqual({
      title: "Red Zari Saree",
      price: "2650",
      category: "Women's Clothing & Shoes",
      description: "Bright red saree.\n\nSoft art silk.\n\nBorder: Gold zari",
      tags: "red saree, zari",
    });
  });

  it("leaves the price empty when there is none, and lists colours in the card's language", () => {
    const f = marketplaceFields(
      { ...text, description: "", attributes: [] },
      { price: null, category: "Something odd", colours: ["লাল", "নীল"], coloursLabel: "রং" },
    );
    expect(f.price).toBe("");
    expect(f.category).toBe("Miscellaneous");
    expect(f.description).toBe("Bright red saree.\n\nরং: লাল, নীল");
  });

  it("maps free-text categories by keyword", () => {
    expect(marketplaceCategory("Silver jewellery")).toBe("Jewelry & Accessories");
    expect(marketplaceCategory("Men's panjabi")).toBe("Men's Clothing & Shoes");
  });
});

describe("MarketplaceLink", () => {
  it("keeps Facebook links and an empty box, and refuses anything else", () => {
    expect(MarketplaceLink.parse(" https://www.facebook.com/marketplace/item/123/ ")).toBe(
      "https://www.facebook.com/marketplace/item/123/",
    );
    expect(MarketplaceLink.parse("https://m.facebook.com/marketplace/item/1")).toBeTruthy();
    expect(MarketplaceLink.parse("https://fb.me/abc")).toBeTruthy();
    expect(MarketplaceLink.parse("")).toBeNull();
    for (const bad of [
      "http://www.facebook.com/x",
      "https://facebook.com.evil.example/x",
      "https://notfacebook.com/x",
      "javascript:alert(1)",
      "facebook.com/x",
    ])
      expect(MarketplaceLink.safeParse(bad).success, bad).toBe(false);
  });
});
