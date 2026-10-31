#!/usr/bin/env node
/**
 * Deletes demo shops a day after they expire: their rows, their media folder, the drafts
 * they saved to the shared demo store, and the anonymous user that made them. Expired demo
 * shops are already hidden from sign-in, but without this their photos and drafts stay
 * forever and fill the disk and the demo store.
 *
 *   pnpm demo:cleanup               delete what is due (reads .env.local)
 *   pnpm demo:cleanup --dry-run     list what would be deleted
 *
 * In production it runs nightly from cron (DEPLOY.md). Every table that belongs to a shop
 * cascades from `workspaces`, so one DELETE removes its jobs, listings, media rows, chats and
 * usage. Demo-store drafts are moved to the store's trash, not deleted, so a mistake can be
 * undone from WooCommerce. If the store can't be reached the shop is kept and tried again
 * next night, so no draft is left behind without its record.
 *
 * It also deletes cutouts no item uses any more, in every shop: running segment again (a
 * retry) replaces a photo's items but leaves the earlier run's files and rows behind.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const mediaDir = path.resolve(process.env.MEDIA_DIR || "./.data/media");
const store = process.env.DEMO_WOO_URL && {
  url: process.env.DEMO_WOO_URL.replace(/\/+$/, ""),
  key: process.env.DEMO_WOO_KEY ?? "",
  secret: process.env.DEMO_WOO_SECRET ?? "",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// a day's grace after expiry, and a bounded run so one night never holds the database long
const GRACE_HOURS = 24;
const BATCH = 200;

/** Moves one draft to the demo store's trash; a product that is already gone counts as done. */
async function trashDraft(id) {
  const res = await fetch(`${store.url}/wp-json/wc/v3/products/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${Buffer.from(`${store.key}:${store.secret}`).toString("base64")}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`store answered ${res.status}`);
}

const db = await createConnection({ uri: url, timezone: "Z" });
try {
  const [shops] = await db.query(
    `SELECT id FROM workspaces
      WHERE is_demo = TRUE AND expires_at < UTC_TIMESTAMP(3) - INTERVAL ${GRACE_HOURS} HOUR
      ORDER BY expires_at LIMIT ${BATCH}`,
  );
  // trashing over plain HTTP would need WooCommerce's OAuth signing; only the local test store is HTTP
  const storeUsable = store && store.url.startsWith("https://");
  if (store && !storeUsable)
    console.log(`[cleanup-demo] ${store.url} isn't https; demo-store drafts are left as they are.`);

  let deleted = 0;
  for (const { id } of shops) {
    if (!UUID.test(id)) {
      console.warn(`[cleanup-demo] skipping workspace with an unexpected id: ${id}`);
      continue;
    }
    const [products] = await db.query(
      "SELECT wc_product_id AS pid FROM listings WHERE workspace_id = ? AND wc_product_id IS NOT NULL",
      [id],
    );
    if (dryRun) {
      console.log(`[cleanup-demo] would delete ${id} (${products.length} store draft(s))`);
      continue;
    }
    try {
      if (storeUsable) for (const { pid } of products) await trashDraft(pid);
    } catch (err) {
      console.warn(`[cleanup-demo] kept ${id} for next time: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    // the anonymous user exists only for this shop; real accounts are never touched
    await db.query(
      `DELETE u FROM user u JOIN memberships m ON m.user_id = u.id
        WHERE m.workspace_id = ? AND u.isAnonymous = TRUE`,
      [id],
    );
    await db.query("DELETE FROM workspaces WHERE id = ?", [id]);
    await rm(path.join(mediaDir, id), { recursive: true, force: true });
    deleted++;
  }
  console.log(
    dryRun
      ? `[cleanup-demo] ${shops.length} expired demo shop(s) due; nothing deleted (dry run).`
      : `[cleanup-demo] deleted ${deleted} of ${shops.length} expired demo shop(s).`,
  );

  // A day's wait keeps out of reach a segment step that is running now: it saves its
  // files before the items that point to them. Nothing made from a cutout may lose it.
  const [unused] = await db.query(
    `SELECT m.id, m.path FROM media m
      WHERE m.kind IN ('main', 'cutout') AND m.listing_id IS NULL
        AND m.created_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY
        AND NOT EXISTS (SELECT 1 FROM items i WHERE i.cutout_media_id = m.id OR i.cutout_png_media_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM media d WHERE d.from_media_id = m.id)
      LIMIT ${BATCH * 5}`,
  );
  let swept = 0;
  for (const { id, path: rel } of unused) {
    const abs = path.resolve(mediaDir, rel);
    if (!abs.startsWith(mediaDir + path.sep)) {
      console.warn(`[cleanup-demo] skipping media ${id} with a path outside the media folder`);
      continue;
    }
    if (dryRun) continue;
    await rm(abs, { force: true });
    await db.query("DELETE FROM media WHERE id = ?", [id]);
    swept++;
  }
  console.log(
    dryRun
      ? `[cleanup-demo] ${unused.length} unused cutout(s) due; nothing deleted (dry run).`
      : `[cleanup-demo] deleted ${swept} unused cutout(s).`,
  );
} finally {
  await db.end();
}
