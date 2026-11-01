import { describe, expect, it } from "vitest";
import { preferredLanguage } from "./accept-language";

const ours = ["en", "bn"] as const;

describe("preferredLanguage", () => {
  it("picks the most wanted of our languages", () => {
    expect(preferredLanguage("bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7", ours)).toBe("bn");
    expect(preferredLanguage("en-GB,en;q=0.9,bn;q=0.5", ours)).toBe("en");
    expect(preferredLanguage("fr;q=0.9,bn;q=0.4", ours)).toBe("bn");
    expect(preferredLanguage("en;q=0.3,bn;q=0.8", ours)).toBe("bn");
  });

  it("gives nothing for a browser that names neither, or refuses one", () => {
    expect(preferredLanguage("fr-FR,de;q=0.5", ours)).toBeNull();
    expect(preferredLanguage("bn;q=0", ours)).toBeNull();
    expect(preferredLanguage(null, ours)).toBeNull();
  });
});
