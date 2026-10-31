import { describe, expect, it } from "vitest";
import { writtenStatus } from "./pipeline";

describe("writtenStatus", () => {
  it("is Ready only when Spark is confident and left nothing to check", () => {
    expect(writtenStatus({ confidence: 0.82, check_notes: [] })).toBe("ready");
  });

  it("needs review when there is something to check, however confident", () => {
    expect(writtenStatus({ confidence: 0.95, check_notes: ["Confirm genuine or faux leather"] })).toBe("needs_review");
  });

  it("needs review when Spark is unsure", () => {
    expect(writtenStatus({ confidence: 0.66, check_notes: [] })).toBe("needs_review");
  });
});
