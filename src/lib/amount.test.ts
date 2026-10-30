import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount";

describe("parseAmount", () => {
  it("reads Bangla and Latin digits, with separators and the taka sign", () => {
    expect(parseAmount("১২৫০")).toBe(1250);
    expect(parseAmount("৳১,২৫০")).toBe(1250);
    expect(parseAmount("1,250")).toBe(1250);
    expect(parseAmount(" 270 ")).toBe(270);
    expect(parseAmount("249.6")).toBe(250);
  });

  it("is null when nothing was typed or there are no digits, never 0", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("৳")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
  });

  it("keeps a typed zero", () => {
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount("০")).toBe(0);
  });
});
