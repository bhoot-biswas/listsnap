import { describe, expect, it, vi } from "vitest";
import { COLOR_FLOOR, decide } from "./fidelity";

describe("decide", () => {
  it("fails at once when the product can't be found, without asking the model", async () => {
    const judge = vi.fn();
    expect(await decide({ found: false, similarity: null, judge })).toMatchObject({ same: false });
    expect(judge).not.toHaveBeenCalled();
  });

  it("fails at once when the colours are clearly another product's", async () => {
    const judge = vi.fn();
    const r = await decide({ found: true, similarity: COLOR_FLOOR - 0.01, judge });
    expect(r).toEqual({
      same: false,
      colorSimilarity: COLOR_FLOOR - 0.01,
      differences: "its colours don't match your photo",
    });
    expect(judge).not.toHaveBeenCalled();
  });

  it("asks the model about pattern and details once the colours pass", async () => {
    const judge = vi.fn().mockResolvedValue({ same: false, differences: "  Gold buttis\nbecame silver paisleys. " });
    expect(await decide({ found: true, similarity: 0.95, judge })).toEqual({
      same: false,
      colorSimilarity: 0.95,
      differences: "Gold buttis became silver paisleys.",
    });
    const ok = vi.fn().mockResolvedValue({ same: true, differences: "" });
    expect(await decide({ found: true, similarity: 0.85, judge: ok })).toEqual({
      same: true,
      colorSimilarity: 0.85,
      differences: "",
    });
  });
});
