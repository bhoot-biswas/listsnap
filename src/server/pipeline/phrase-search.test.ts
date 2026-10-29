import { describe, expect, it, vi } from "vitest";
import { searchPhrases } from "./phrase-search";

const finder = (hits: Record<string, number[]>) => vi.fn(async (p: string) => hits[p] ?? []);

describe("searchPhrases", () => {
  it("stops after the planned phrase when it matches", async () => {
    const find = finder({ saree: [1] });
    expect(await searchPhrases(["saree", "fabric", "cloth"], find)).toEqual({
      phrase: "saree",
      found: [1],
      tried: ["saree"],
    });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("runs the alternatives together and keeps the earliest hit", async () => {
    let inFlight = 0;
    let peak = 0;
    const find = vi.fn(async (p: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ({ fabric: [2], cloth: [3] } as Record<string, number[]>)[p] ?? [];
    });
    const r = await searchPhrases(["saree", "fabric", "cloth"], find);
    expect(r).toEqual({ phrase: "fabric", found: [2], tried: ["saree", "fabric", "cloth"] });
    expect(peak).toBe(2);
  });

  it("reports a miss when nothing matches", async () => {
    expect(await searchPhrases(["a", "b"], finder({}))).toEqual({ phrase: null, found: [], tried: ["a", "b"] });
    expect(await searchPhrases([], finder({}))).toEqual({ phrase: null, found: [], tried: [] });
  });
});
