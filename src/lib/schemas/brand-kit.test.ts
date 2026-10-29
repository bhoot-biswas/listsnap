import { describe, expect, it } from "vitest";
import { brandKitFromForm, hasBrandKit } from "./brand-kit";

const form = (fields: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return f;
};

describe("brandKitFromForm", () => {
  it("keeps the colours only when the seller ticked them, upper-cased and without repeats", () => {
    const on = brandKitFromForm(
      form([
        ["useColors", "on"],
        ["colors", "#7a1f2b"],
        ["colors", "#7A1F2B"],
        ["colors", "#d9a441"],
      ]),
    );
    expect(on.data).toEqual({ colors: ["#7A1F2B", "#D9A441"], settingMediaId: null });
    const off = brandKitFromForm(form([["colors", "#7a1f2b"]]));
    expect(off.data?.colors).toEqual([]);
  });

  it("reads the uploaded shop photo id and refuses anything that isn't one", () => {
    const id = "6f1c2c1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";
    expect(brandKitFromForm(form([["settingMediaId", id]])).data?.settingMediaId).toBe(id);
    expect(brandKitFromForm(form([["settingMediaId", "../../etc/passwd"]])).success).toBe(false);
  });

  it("knows when a shop has no kit", () => {
    expect(hasBrandKit({ colors: [], settingMediaId: null })).toBe(false);
    expect(hasBrandKit({ colors: ["#000000"], settingMediaId: null })).toBe(true);
  });
});
