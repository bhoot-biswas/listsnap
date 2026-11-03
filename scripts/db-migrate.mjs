#!/usr/bin/env node
/**
 * Applies the SQL files in db/migrations, in file-name order, each one once. What has run
 * is recorded by file name in `listsnap_migrations`, which /api/health also reads.
 *
 *   pnpm db:migrate                  apply what is pending (reads .env.local)
 *   pnpm db:status                   list applied and pending files, change nothing
 *   node scripts/db-migrate.mjs --if-configured
 *                                    the build's form: skip quietly when there is no
 *                                    database to reach, so a build without one still works
 *
 * MySQL commits every CREATE and ALTER on its own, so a file that fails halfway can't be
 * rolled back. Files are written to be safe to run again (IF NOT EXISTS), and a failed one
 * is left unrecorded so the next run tries it again after the fix.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const statusOnly = process.argv.includes("--status");
const ifConfigured = process.argv.includes("--if-configured");
// a second runner (CI and a deploy, two builds) waits for the first instead of racing it
const LOCK = "listsnap_migrate";
const LOCK_WAIT_SECONDS = 60;

const url = (process.env.DATABASE_URL ?? "").trim();
if (!url) {
  if (ifConfigured) {
    console.log("[migrate] DATABASE_URL is not set; skipping migrations.");
    process.exit(0);
  }
  console.error("[migrate] DATABASE_URL is not set.");
  process.exit(1);
}

let db;
try {
  // migration files hold several statements each
  db = await createConnection({ uri: url, multipleStatements: true, timezone: "Z" });
} catch (err) {
  if (ifConfigured) {
    console.warn(`[migrate] database not reachable (${err.code ?? err.message}); skipping migrations.`);
    process.exit(0);
  }
  throw err;
}

try {
  await db.query(
    `CREATE TABLE IF NOT EXISTS listsnap_migrations (
       name VARCHAR(255) NOT NULL PRIMARY KEY,
       applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  const [[{ locked }]] = await db.query("SELECT GET_LOCK(?, ?) AS locked", [LOCK, LOCK_WAIT_SECONDS]);
  if (locked !== 1) throw new Error("another migration run is still going");

  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const [rows] = await db.query("SELECT name FROM listsnap_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (statusOnly) {
    for (const f of files) console.log(`${applied.has(f) ? "applied" : "pending"}  ${f}`);
    console.log(`[migrate] ${files.length - pending.length} applied, ${pending.length} pending.`);
  } else {
    for (const f of pending) {
      const sql = await readFile(path.join(DIR, f), "utf8");
      try {
        await db.query(sql);
      } catch (err) {
        console.error(`[migrate] ${f} failed: ${err.message}`);
        process.exitCode = 1;
        break;
      }
      // only the name: an older table may carry other columns, all with defaults
      await db.query("INSERT INTO listsnap_migrations (name) VALUES (?)", [f]);
      console.log(`[migrate] applied ${f}`);
    }
    if (!process.exitCode) console.log(pending.length ? "[migrate] done." : "[migrate] nothing to apply.");
  }
} finally {
  await db.end();
}
