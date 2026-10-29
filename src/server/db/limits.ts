import "server-only";
import { createHash } from "node:crypto";
import { execute, selectOne } from "./pool";

/**
 * The daily limits, counted in usage_daily (UTC days). A slot is reserved before the
 * work it pays for, in one conditional UPDATE, so two tabs or a fast bulk upload can't
 * both take the last one. Spread into forWorkspace().
 */

type Counter = "listings" | "images";

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

    /** Takes one of today's AI photo slots, just before Muse Image is called. */
    reserveImage: (limit: number) => reserve("usage_daily", ws, "images", limit),

    /** What the meters show: listings started and AI photos made today. */
    async usageToday(): Promise<{ listings: number; images: number }> {
      const row = await selectOne<{ listings: number; images: number }>(
        "SELECT listings, images FROM usage_daily WHERE workspace_id = ? AND date = UTC_DATE()",
        [ws],
      );
      return { listings: Number(row?.listings ?? 0), images: Number(row?.images ?? 0) };
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
