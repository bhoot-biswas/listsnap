import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeNext("/job/abc/review?l=1")).toBe("/job/abc/review?l=1");
    expect(safeNext("/api/shopify/install?shop=demo.myshopify.com")).toBe(
      "/api/shopify/install?shop=demo.myshopify.com",
    );
  });

  it("drops anything that could leave the site, or loop back to sign-in", () => {
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "evil",
      "",
      "/sign-in?next=/x",
      null,
      5,
    ])
      expect(safeNext(bad)).toBeNull();
  });
});
