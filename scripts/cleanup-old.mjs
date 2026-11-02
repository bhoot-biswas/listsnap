#!/usr/bin/env node
/**
 * Removes what no seller needs any more, so the disk and the log tables stop growing for
 * good. Runs nightly from cron after the demo cleanup (DEPLOY.md):
 *
 *   node --env-file=… scripts/cleanup-old.mjs             delete what is due
 *   node --env-file=… scripts/cleanup-old.mjs --dry-run   count it, delete nothing
 *
 * - Videos, 7 days after their watch made the batch's listings (30 after a watch that
 *   failed, so Try again still has its video). Each is up to 200 MB, and its products are
 *   photos by then. The batch keeps its video id, so it still shows as "From a video".
 * - Files in the media folder that no media row names: left by an upload or render that
 *   failed between writing the file and its row, or the small copies of a deleted image.
 * - Old rows of the logs: Shopify webhook ids (Shopify retries for 48 hours), per-visitor
 *   counts, op runs that can no longer be undone, and calls and events older than a year.
 *   Pages read at most the last 30 days.
 */
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const mediaDir = path.resolve(process.env.MEDIA_DIR || "./.data/media");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// a bounded night, so one run never holds a table long
const BATCH = 5000;
// a file younger than this may be one whose row is being written right now
const ORPHAN_AGE_MS = 24 * 3600_000;
const log = (msg) => console.log(`[cleanup-old] ${msg}`);

const inside = (rel) => {
  const abs = path.resolve(mediaDir, rel);
  return abs.startsWith(mediaDir + path.sep) ? abs : null;
};

const db = await createConnection({ uri: url, timezone: "Z" });
try {
  // videos whose watch is long over
  const [videos] = await db.query(
    `SELECT m.id, m.path, m.bytes FROM batches b
       JOIN batch_steps s ON s.batch_id = b.id AND s.step = 'watch'
       JOIN media m ON m.id = b.video_media_id AND m.workspace_id = b.workspace_id AND m.kind = 'video'
      WHERE (s.status = 'done' AND s.finished_at < UTC_TIMESTAMP(3) - INTERVAL 7 DAY)
         OR (s.status = 'failed' AND s.finished_at < UTC_TIMESTAMP(3) - INTERVAL 30 DAY)
      LIMIT ${BATCH}`,
  );
  let freed = 0;
  for (const v of videos) {
    const abs = inside(v.path);
    if (!abs) {
      log(`skipping video ${v.id} with a path outside the media folder`);
      continue;
    }
    freed += Number(v.bytes ?? 0);
    if (dryRun) continue;
    // the row first: a file left behind is swept as an orphan, a row without its file is not
    await db.query("DELETE FROM media WHERE id = ?", [v.id]);
    await rm(abs, { force: true });
  }
  log(`${dryRun ? "would delete" : "deleted"} ${videos.length} old video(s), ${(freed / 1e6).toFixed(0)} MB`);

  // files no media row names, shop by shop
  let orphans = 0;
  let orphanBytes = 0;
  const shops = await readdir(mediaDir, { withFileTypes: true }).catch(() => []);
  for (const shop of shops) {
    if (!shop.isDirectory() || !UUID.test(shop.name)) continue;
    const [rows] = await db.query("SELECT path FROM media WHERE workspace_id = ?", [shop.name]);
    const known = new Set(rows.map((r) => path.resolve(mediaDir, r.path)));
    const files = await readdir(path.join(mediaDir, shop.name), { recursive: true, withFileTypes: true });
    for (const f of files) {
      if (!f.isFile()) continue;
      const abs = path.join(f.parentPath, f.name);
      // a smaller copy belongs to its image: kept while the image is
      const base = abs.replace(/\.w\d+\.webp$/, "");
      if (known.has(abs) || known.has(base)) continue;
      const s = await stat(abs);
      if (Date.now() - s.mtimeMs < ORPHAN_AGE_MS) continue;
      orphans++;
      orphanBytes += s.size;
      if (!dryRun) await rm(abs, { force: true });
    }
  }
  log(
    `${dryRun ? "would delete" : "deleted"} ${orphans} file(s) no media row names, ${(orphanBytes / 1e6).toFixed(1)} MB`,
  );

  // old log rows, oldest first, a bounded batch each
  const prunes = [
    ["Shopify webhook ids", "shopify_webhooks", "received_at < UTC_TIMESTAMP(3) - INTERVAL 30 DAY"],
    ["per-visitor counts", "ip_daily", "date < UTC_DATE() - INTERVAL 90 DAY"],
    ["daily usage counts", "usage_daily", "date < UTC_DATE() - INTERVAL 400 DAY"],
    [
      "op runs past undo",
      "op_runs",
      "status <> 'running' AND undo_json IS NULL AND created_at < UTC_TIMESTAMP(3) - INTERVAL 90 DAY",
    ],
    ["outside calls", "api_calls", "created_at < UTC_TIMESTAMP(3) - INTERVAL 365 DAY"],
    ["events", "events", "created_at < UTC_TIMESTAMP(3) - INTERVAL 365 DAY"],
  ];
  for (const [label, table, where] of prunes) {
    if (dryRun) {
      const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
      log(`would delete ${n} ${label}`);
      continue;
    }
    const [r] = await db.query(`DELETE FROM ${table} WHERE ${where} LIMIT ${BATCH}`);
    log(`deleted ${r.affectedRows} ${label}`);
  }
} finally {
  await db.end();
}
