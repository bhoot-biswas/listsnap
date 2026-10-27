import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("store credentials at rest (AES-256-GCM)", () => {
  it("round-trips, with a fresh IV every time", () => {
    const a = encryptSecret("ck_live_123:cs_456", key);
    const b = encryptSecret("ck_live_123:cs_456", key);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret(a, key)).toBe("ck_live_123:cs_456");
  });

  it("refuses a tampered value or the wrong key", () => {
    const stored = encryptSecret("secret", key);
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(stored, randomBytes(32).toString("base64"))).toThrow();
  });

  it("rejects a key of the wrong length", () => {
    expect(() => encryptSecret("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("masks all but the last four characters", () => {
    expect(maskSecret("cs_abcdef1234")).toBe("••••1234");
    expect(maskSecret("abc")).toBe("••••");
  });
});
