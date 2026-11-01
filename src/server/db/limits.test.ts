import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "./limits";

describe("DEFAULT_LIMITS", () => {
  it("matches what a new shop gets from the workspaces table's defaults, which Pricing quotes", () => {
    const sql = readFileSync(path.join(process.cwd(), "db/migrations/0002_workspaces.sql"), "utf8");
    const value = (column: string) => Number(new RegExp(`\`${column}\` INT NOT NULL DEFAULT (\\d+)`).exec(sql)?.[1]);
    expect(DEFAULT_LIMITS.listings).toBe(value("daily_listing_limit"));
    expect(DEFAULT_LIMITS.images).toBe(value("daily_image_limit"));
  });
});
