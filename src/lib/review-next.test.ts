import { describe, expect, it } from "vitest";
import { nextListing, numberRepeats } from "./review-next";

const l = (id: string, status: string) => ({ id, status });

describe("nextListing", () => {
  it("goes to the next one not in the store yet, wrapping round", () => {
    const all = [l("a", "in_store"), l("b", "needs_review"), l("c", "ready"), l("d", "posted")];
    expect(nextListing(all, "b")?.id).toBe("c");
    expect(nextListing(all, "c")?.id).toBe("b");
    expect(nextListing(all, "d")?.id).toBe("b");
  });

  it("has none when every other one is saved, or there is only one", () => {
    expect(nextListing([l("a", "needs_review"), l("b", "in_store")], "a")).toBeNull();
    expect(nextListing([l("a", "ready")], "a")).toBeNull();
  });

  it("starts from the first without a current listing, as on Done", () => {
    expect(nextListing([l("a", "in_store"), l("b", "ready")], null)?.id).toBe("b");
  });
});

describe("numberRepeats", () => {
  it("numbers only titles that repeat, by their place in the tabs", () => {
    const out = numberRepeats(
      [{ title: "Saree" }, { title: "Kurti" }, { title: "Saree" }, { title: null }],
      (t, n) => `${n}. ${t}`,
    );
    expect(out.map((x) => x.title)).toEqual(["1. Saree", "Kurti", "3. Saree", null]);
    expect(out.map((x) => x.n)).toEqual([1, 2, 3, 4]);
  });
});
