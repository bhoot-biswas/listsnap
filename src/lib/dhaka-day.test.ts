import { describe, expect, it } from "vitest";
import { dhakaDay } from "./dhaka-day";

describe("dhakaDay", () => {
  it("turns over at midnight in Dhaka, which is 18:00 UTC", () => {
    expect(dhakaDay(Date.parse("2026-11-01T17:59:00Z"))).toBe("2026-11-01");
    expect(dhakaDay(Date.parse("2026-11-01T18:00:00Z"))).toBe("2026-11-02");
    // 1 AM in Dhaka is still the previous day in UTC; the seller's "today" is the new one
    expect(dhakaDay(Date.parse("2026-11-01T19:00:00Z"))).toBe("2026-11-02");
  });

  it("counts back whole days", () => {
    expect(dhakaDay(Date.parse("2026-11-01T19:00:00Z"), 1)).toBe("2026-11-01");
    expect(dhakaDay(Date.parse("2026-11-01T19:00:00Z"), 6)).toBe("2026-10-27");
  });
});
