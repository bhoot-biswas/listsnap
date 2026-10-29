import { describe, expect, it } from "vitest";
import { localTitle } from "./titles";

describe("localTitle", () => {
  it("shows Bangla in Bangla when there is one, English otherwise", () => {
    const row = { title: "Jamdani Saree", title_bn: "জামদানি শাড়ি" };
    expect(localTitle(row, "bn")).toEqual({ text: "জামদানি শাড়ি", lang: "bn" });
    expect(localTitle(row, "en")).toEqual({ text: "Jamdani Saree", lang: "en" });
    expect(localTitle({ title: "Mug", title_bn: null }, "bn")).toEqual({ text: "Mug", lang: "en" });
  });
});
