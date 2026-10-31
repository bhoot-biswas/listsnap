import { describe, expect, it } from "vitest";
import { imageName, imagePlan } from "./images";

describe("imagePlan", () => {
  it("uploads every photo for a new draft", () => {
    expect(imagePlan([], ["main", "studio"])).toEqual([
      { kind: "upload", mediaId: "main" },
      { kind: "upload", mediaId: "studio" },
    ]);
  });

  it("keeps photos already in the store, adds new ones and drops unticked ones", () => {
    const existing = [
      { id: 11, name: imageName("main") },
      { id: 12, name: imageName("studio") },
    ];
    expect(imagePlan(existing, ["main", "look-eid"])).toEqual([
      { kind: "keep", mediaId: "main", id: 11 },
      { kind: "upload", mediaId: "look-eid" },
    ]);
  });

  it("keeps images the seller added in the store, after ours", () => {
    const existing = [
      { id: 11, name: imageName("main") },
      { id: 30, name: "my own shot" },
    ];
    expect(imagePlan(existing, ["main"])).toEqual([
      { kind: "keep", mediaId: "main", id: 11 },
      { kind: "theirs", id: 30 },
    ]);
  });

  it("leaves a draft from before image names as it is", () => {
    expect(imagePlan([{ id: 5, name: "red-square" }], ["main", "studio"])).toBeNull();
  });
});
