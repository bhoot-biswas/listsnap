import { describe, expect, it } from "vitest";
import { catalogAccess } from "./meta-access";

const now = Date.parse("2026-11-01T12:00:00Z");
const inDays = (d: number) => new Date(now + d * 24 * 3600 * 1000).toISOString();

describe("catalogAccess", () => {
  it("is fine until the last two weeks, then warns, then has ended", () => {
    expect(catalogAccess(inDays(60), now).state).toBe("ok");
    expect(catalogAccess(inDays(15), now).state).toBe("ok");
    expect(catalogAccess(inDays(14), now).state).toBe("soon");
    expect(catalogAccess(inDays(1), now).state).toBe("soon");
    expect(catalogAccess(inDays(0), now).state).toBe("expired");
    expect(catalogAccess(inDays(-3), now)).toMatchObject({ state: "expired", until: new Date(inDays(-3)) });
  });

  it("says nothing when Meta didn't tell us, or the date is unreadable", () => {
    expect(catalogAccess(null, now)).toEqual({ state: "ok", until: null });
    expect(catalogAccess("not a date", now)).toEqual({ state: "ok", until: null });
  });
});
