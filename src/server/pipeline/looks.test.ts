import { describe, expect, it } from "vitest";
import { LOOKS, lookKind, lookOf } from "@/lib/schemas/looks";
import { lookBrief } from "./looks";

describe("looks", () => {
  it("round-trips a look through its media kind and ignores other kinds", () => {
    for (const look of LOOKS) expect(lookOf(lookKind(look))).toBe(look);
    for (const kind of ["lifestyle", "studio", "look_party", "look_"]) expect(lookOf(kind)).toBeNull();
  });

  it("sets each look's own scene but keeps what the plan said to leave out", () => {
    const planBrief = { setting: "on a chair", palette: ["cream"], avoid: ["a matching blouse"] };
    for (const look of LOOKS) {
      const b = lookBrief(look, planBrief);
      expect(b.setting).not.toBe(planBrief.setting);
      expect(b.palette.length).toBeGreaterThan(0);
      expect(b.avoid).toEqual(["a matching blouse"]);
    }
    expect(lookBrief("eid", null).avoid).toEqual([]);
  });
});
