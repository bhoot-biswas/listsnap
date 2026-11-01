import { describe, expect, it } from "vitest";
import { saveAll } from "./save-all";

describe("saving several listings to the store", () => {
  it("carries on past a failure and says which ones failed", async () => {
    const tried: string[] = [];
    const r = await saveAll(["a", "b", "c"], async (id) => {
      tried.push(id);
      return id === "b" ? { ok: false, message: "The store said no." } : { ok: true };
    });
    expect(tried).toEqual(["a", "b", "c"]);
    expect(r).toEqual({ saved: ["a", "c"], failed: [{ id: "b", message: "The store said no." }] });
  });

  it("counts a save that throws as failed, and reports progress after each", async () => {
    const progress: number[] = [];
    const r = await saveAll(
      ["a", "b"],
      async (id) => {
        if (id === "a") throw new Error("offline");
        return { ok: true };
      },
      (n) => progress.push(n),
    );
    expect(r.failed).toEqual([{ id: "a", message: null }]);
    expect(r.saved).toEqual(["b"]);
    expect(progress).toEqual([1, 2]);
  });
});
