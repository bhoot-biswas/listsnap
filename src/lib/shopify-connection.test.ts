import { describe, expect, it } from "vitest";
import { normaliseShopDomain } from "./shopify-connection";

describe("normaliseShopDomain", () => {
  it.each([
    ["rupkotha", "rupkotha.myshopify.com"],
    ["Rupkotha.myshopify.com", "rupkotha.myshopify.com"],
    ["https://rupkotha.myshopify.com/admin/products", "rupkotha.myshopify.com"],
    ["  rupkotha-crafts.myshopify.com/  ", "rupkotha-crafts.myshopify.com"],
    ["https://admin.shopify.com/store/rupkotha/products/123", "rupkotha.myshopify.com"],
  ])("reads %s as %s", (typed, shop) => {
    expect(normaliseShopDomain(typed)).toBe(shop);
  });

  it.each([
    "rupkotha.com",
    "rupkotha.myshopify.com.evil.example",
    "evil.example/rupkotha.myshopify.com",
    "-bad.myshopify.com",
    "",
    "my shop",
  ])("refuses %s", (typed) => {
    expect(() => normaliseShopDomain(typed)).toThrow();
  });
});
