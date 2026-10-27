import { describe, expect, it } from "vitest";
import { normaliseStoreUrl } from "./woo-connection";

describe("normaliseStoreUrl", () => {
  it("adds https and drops trailing slashes", () => {
    expect(normaliseStoreUrl(" myshop.com/ ")).toBe("https://myshop.com");
    expect(normaliseStoreUrl("https://myshop.com/shop/")).toBe("https://myshop.com/shop");
  });

  it("keeps http when typed, so the HTTPS check can flag it", () => {
    expect(normaliseStoreUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("throws on something that isn't an address", () => {
    expect(() => normaliseStoreUrl("not a url")).toThrow();
  });
});
