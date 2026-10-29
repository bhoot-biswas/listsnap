import { describe, expect, it } from "vitest";
import { z } from "zod";
import { opList, ops } from "./index";

// The registry is what chat tools will be generated from, so its shape is a contract.
describe("op registry", () => {
  it("names every op after its key, once", () => {
    for (const [key, op] of Object.entries(ops)) expect(op.name).toBe(key);
    expect(new Set(opList().map((o) => o.name)).size).toBe(opList().length);
  });

  it("gives every op a description a model can choose by", () => {
    for (const op of opList()) {
      expect(op.description.length, op.name).toBeGreaterThan(40);
      expect(op.description.length, op.name).toBeLessThan(400);
    }
  });

  it("has input schemas that convert to JSON Schema for tool definitions", () => {
    for (const op of opList()) {
      const schema = z.toJSONSchema(op.input, { io: "input", unrepresentable: "any" });
      expect(schema.type, op.name).toBe("object");
    }
  });

  it("costs AI photos only for ops that make media", () => {
    expect(ops.renderScene.cost!({ listingId: "x", scene: "studio" })).toEqual({ images: 1 });
    expect(ops.saveListingEdit.effect).toBe("edits_draft");
    expect(ops.saveDraftToStore.effect).toBe("changes_store");
    for (const op of opList().filter((o) => o.effect !== "creates_media"))
      expect(op.cost!({} as never).images, op.name).toBe(0);
  });
});
