import "server-only";
import { createHash } from "node:crypto";
import { execute, selectOne } from "./pool";

/**
 * The daily limits, counted in usage_daily (UTC days). A slot is reserved before the
 * work it pays for, in one conditional UPDATE, so two tabs or a fast bulk upload can't
 * both take the last one. Spread into forWorkspace().
 */

type Counter = "listings" | "images" | "reels";

/** Reels a shop can make each day. Rendering costs no AI money, only server time. */
export const REELS_PER_DAY = 10;

/**
 * What a new shop starts with: the columns' defaults in 0002_workspaces.sql, for pages
 * shown before there is a shop (Pricing). A shop's own limits are on its workspace row.
 */
export const DEFAULT_LIMITS = { listings: 20, images: 60, reels: REELS_PER_DAY } as const;

async function reserve(table: "usage_daily" | "ip_daily", key: string, counter: Counter, limit: number) {
  const keyColumn = table === "usage_daily" ? "workspace_id" : "ip_hash";
  await execute(`INSERT IGNORE INTO ${table} (${keyColumn}, date) VALUES (?, UTC_DATE())`, [key]);
  const r = await execute(
    `UPDATE ${table} SET ${counter} = ${counter} + 1 WHERE ${keyColumn} = ? AND date = UTC_DATE() AND ${counter} < ?`,
    [key, limit],
  );
  return r.affectedRows === 1;
}

export function limitQueries(ws: string) {
  return {
    /** Takes one of today's listing slots; false when the limit is reached. */
    reserveListing: (limit: number) => reserve("usage_daily", ws, "listings", limit),

    /** Gives a slot back when the photo it was for never became a job. */
    async releaseListing() {
      await execute(
        "UPDATE usage_daily SET listings = GREATEST(listings - 1, 0) WHERE workspace_id = ? AND date = UTC_DATE()",
        [ws],
      );
    },

    /**
     * A new demo shop's sample listings, counted like listings it made today so the
     * usage meter agrees with the Dashboard. No limit check: the shop was just created.
     */
    async countSampleListings(n: number) {
      await execute(
        `INSERT INTO usage_daily (workspace_id, date, listings) VALUES (?, UTC_DATE(), ?)
           ON DUPLICATE KEY UPDATE listings = listings + VALUES(listings)`,
        [ws, n],
      );
    },

    /** Takes one of today's AI photo slots, just before Muse Image is called. */
    reserveImage: (limit: number) => reserve("usage_daily", ws, "images", limit),

    /** Gives an AI photo slot back when the step failed before Muse Image made a photo. */
    async releaseImage() {
      await execute(
        "UPDATE usage_daily SET images = GREATEST(images - 1, 0) WHERE workspace_id = ? AND date = UTC_DATE()",
        [ws],
      );
    },

    /** Takes one of today's reel slots, just before a reel renders. */
    reserveReel: () => reserve("usage_daily", ws, "reels", REELS_PER_DAY),

    /** Gives a reel slot back when the render failed: that's the server's fault, not the seller's. */
    async releaseReel() {
      await execute(
        "UPDATE usage_daily SET reels = GREATEST(reels - 1, 0) WHERE workspace_id = ? AND date = UTC_DATE()",
        [ws],
      );
    },

    /** What the meters show: listings started, AI photos and reels made today. */
    async usageToday(): Promise<{ listings: number; images: number; reels: number }> {
      const row = await selectOne<{ listings: number; images: number; reels: number }>(
        "SELECT listings, images, reels FROM usage_daily WHERE workspace_id = ? AND date = UTC_DATE()",
        [ws],
      );
      return { listings: Number(row?.listings ?? 0), images: Number(row?.images ?? 0), reels: Number(row?.reels ?? 0) };
    },
  };
}

/** Listings a visitor can start each day across all their demo shops. */
export const DEMO_LISTINGS_PER_IP = 20;

/**
 * The one count that isn't per shop: demo shops are free to make, so a visitor's demo
 * listings are also capped per address. Only a salted hash is stored, never the address.
 */
export const demoIpLimit = {
  hash: (ip: string, salt: string) => createHash("sha256").update(`${salt}:${ip}`).digest("hex"),
  reserve: (ipHash: string) => reserve("ip_daily", ipHash, "listings", DEMO_LISTINGS_PER_IP),
  async release(ipHash: string) {
    await execute("UPDATE ip_daily SET listings = GREATEST(listings - 1, 0) WHERE ip_hash = ? AND date = UTC_DATE()", [
      ipHash,
    ]);
  },
};
