import { describe, expect, it } from "vitest";
import { createFormatter } from "next-intl";
import { relativeTime } from "./relative-time";

const now = new Date("2026-10-31T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const later = (ms: number) => new Date(now.getTime() + ms);

describe("relative time", () => {
  it("says আগে and ঘণ্টা for every Bangla time", () => {
    const bn = createFormatter({ locale: "bn", now });
    expect(relativeTime(bn, ago(59_000), now)).toBe("৫৯ সেকেন্ড আগে");
    expect(relativeTime(bn, ago(2 * 60_000), now)).toBe("২ মিনিট আগে");
    expect(relativeTime(bn, ago(5 * 3_600_000), now)).toBe("৫ ঘণ্টা আগে");
    expect(relativeTime(bn, ago(400 * 86_400_000), now)).toBe("১ বছর আগে");
    expect(relativeTime(bn, later(3 * 3_600_000), now)).toBe("৩ ঘণ্টায়");
  });

  it("leaves English as it was", () => {
    const en = createFormatter({ locale: "en", now });
    expect(relativeTime(en, ago(59_000), now)).toBe("59 seconds ago");
    expect(relativeTime(en, later(3 * 3_600_000), now)).toBe("in 3 hours");
  });
});
