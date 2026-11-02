import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, visitorKey } from "./limits";

describe("DEFAULT_LIMITS", () => {
  it("matches what a new shop gets from the workspaces table's defaults, which Pricing quotes", () => {
    const sql = readFileSync(path.join(process.cwd(), "db/migrations/0002_workspaces.sql"), "utf8");
    const value = (column: string) => Number(new RegExp(`\`${column}\` INT NOT NULL DEFAULT (\\d+)`).exec(sql)?.[1]);
    expect(DEFAULT_LIMITS.listings).toBe(value("daily_listing_limit"));
    expect(DEFAULT_LIMITS.images).toBe(value("daily_image_limit"));
  });
});

describe("visitorKey", () => {
  it("counts a whole IPv6 /64 as one visitor, however the address is written", () => {
    expect(visitorKey("2001:db8:85a3:8d3::1")).toBe("2001:db8:85a3:8d3::/64");
    expect(visitorKey("2001:0db8:85a3:08d3:1319:8a2e:0370:7344")).toBe("2001:db8:85a3:8d3::/64");
    expect(visitorKey("2001:DB8:85A3:8D3:FFFF::")).toBe("2001:db8:85a3:8d3::/64");
    expect(visitorKey("2001:db8::7")).toBe("2001:db8:0:0::/64");
  });

  it("leaves IPv4 alone, including an IPv4 address written as IPv6", () => {
    expect(visitorKey("203.0.113.9")).toBe("203.0.113.9");
    expect(visitorKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(visitorKey("unknown")).toBe("unknown");
  });
});
