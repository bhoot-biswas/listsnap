import { describe, expect, it } from "vitest";
import { chatGroup } from "./chat-groups";

// 01:00 on 1 November in Dhaka (UTC+6)
const now = new Date("2026-10-31T19:00:00Z");
const group = (iso: string) => chatGroup(new Date(iso), now, "Asia/Dhaka");

describe("chat groups", () => {
  it("counts calendar days in the seller's time zone", () => {
    expect(group("2026-10-31T18:30:00Z")).toBe("today"); // 00:30 Dhaka, same day
    expect(group("2026-10-31T17:30:00Z")).toBe("yesterday"); // 23:30 Dhaka the day before, 90 minutes ago
    expect(group("2026-10-31T01:00:00Z")).toBe("yesterday");
    expect(group("2026-10-29T12:00:00Z")).toBe("week");
    expect(group("2026-10-26T00:00:00Z")).toBe("week");
    expect(group("2026-10-25T17:00:00Z")).toBe("older");
  });
});
