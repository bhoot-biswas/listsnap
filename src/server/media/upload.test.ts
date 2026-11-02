import { describe, expect, it } from "vitest";
import { isHeic } from "./upload";

// the first 40 bytes of an iPhone-style HEIC (libheif's example.heic) and of an AVIF from sharp
const HEIC = "0000001c667479706d696631000000006d6966316865696368657663000003996d65746100000000";
const AVIF = "0000001c6674797061766966000000006d696631617669666d696166000000d66d65746100000000";
const bytes = (hex: string) => Buffer.from(hex, "hex");

describe("isHeic", () => {
  it("knows an HEVC HEIF from its brands", () => {
    expect(isHeic(bytes(HEIC))).toBe(true);
  });

  it("leaves AVIF, which the server reads, and other files alone", () => {
    expect(isHeic(bytes(AVIF))).toBe(false);
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]))).toBe(false);
    expect(isHeic(Buffer.alloc(4))).toBe(false);
  });
});
