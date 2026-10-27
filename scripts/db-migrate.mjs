#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql in order, once each.
 *
 *   pnpm db:migrate                                  apply what is pending (reads .env.local)
 *   pnpm db:status                                   list applied and pending
 *   node scripts/db-migrate.mjs --if-configured      what `pnpm build` runs
 *
 * Adapted from SOHOZ TOOLS (README → pre-existing code).
 *
 * `--if-configured` is the build step. With no DATABASE_URL (CI, a fork) it says so in
 * one line and lets the build go on. With one, the tables are brought up to date before
 * Next builds, so a deploy never runs new code against old tables. If the database is
 * set but cannot be reached, the build stops: shipping an app whose sign-in fails on
 * every request is worse than keeping the previous deploy, which is what Hostinger does
 * when a build fails.
 *
 * Applied files are recorded in `listsnap_migrations`. A file that fails stops the run
 * and is not recorded, so it is retried next time. MySQL commits DDL implicitly, so a
 * file that fails halfway may have created some of its tables; the statements are
 * written to be re-runnable where that matters.
 *
 * On Hostinger without SSH the same files can be pasted into phpMyAdmin in order.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const ifConfigured = process.argv.includes("--if-configured");
const url = process.env.DATABASE_URL;
if (!url) {
  if (ifConfigured) {
    console.log("[db-migrate] DATABASE_URL is not set — nothing to migrate (mock-only build).");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local, then run: pnpm db:migrate");
  process.exit(1);
}

const dir = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

let db;
try {
  // ten seconds, not the driver's default: a build waiting on an unreachable host
  // should fail while someone is still watching the log
  db = await createConnection({ uri: url, multipleStatements: false, timezone: "Z", connectTimeout: 10_000 });
} catch (err) {
  // MySQL's own wording names the user and the address it saw the connection come from
  // ("Access denied for user 'x'@'203.0.113.5' (using password: YES)") — that is what
  // tells a wrong password from a host that is not allowed in. It never contains the
  // password. Where the server sent nothing, the URL's host and user are shown instead.
  let where = "";
  try {
    const u = new URL(url);
    where = `  Tried: user "${decodeURIComponent(u.username)}" at host "${u.hostname}", port ${u.port || 3306}, database "${u.pathname.slice(1)}"\n`;
  } catch {
    where = "  DATABASE_URL is not a valid URL — expected mysql://USER:PASSWORD@HOST:3306/DATABASE\n";
  }
  console.error(
    `[db-migrate] Could not connect to the database: ${err.code ?? "error"}\n` +
      (err.sqlMessage ? `  MySQL said: ${err.sqlMessage}\n` : "") +
      where +
      "  Check DATABASE_URL (host, user, password, database name).\n" +
      "  If the build server cannot reach the database at all, create the tables once in\n" +
      "  phpMyAdmin instead (db/README.md, step 2) and this step will find nothing to do.",
  );
  process.exit(1);
}

// Bangla listings and names need four-byte UTF-8. Every table takes the database's
// default, so a latin1 or utf8mb3 database would store "?" for every Bangla letter.
const [[{ cs, co }]] = await db.query("SELECT @@character_set_database AS cs, @@collation_database AS co");
if (cs !== "utf8mb4") {
  console.error(
    `This database uses ${cs}; it needs utf8mb4 for Bangla text. Fix it first, then run again:\n` +
      "  ALTER DATABASE `<name>` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
  );
  await db.end();
  process.exit(1);
}
await db.query(
  "CREATE TABLE IF NOT EXISTS `listsnap_migrations` (`name` VARCHAR(191) NOT NULL PRIMARY KEY, `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
);
const [rows] = await db.query("SELECT name FROM listsnap_migrations");
const done = new Set(rows.map((r) => r.name));

if (process.argv.includes("--status")) {
  for (const f of files) console.log(`${done.has(f) ? "applied" : "pending"}  ${f}`);
  await db.end();
  process.exit(0);
}

/** Splits on semicolons that end a line, after dropping `--` comment lines. */
const statements = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

let applied = 0;
for (const f of files) {
  if (done.has(f)) continue;
  const sql = await readFile(path.join(dir, f), "utf8");
  try {
    for (const s of statements(sql)) await db.query(s);
    await db.query("INSERT INTO listsnap_migrations (name) VALUES (?)", [f]);
    console.log(`applied  ${f}`);
    applied += 1;
  } catch (err) {
    console.error(`failed   ${f}\n  ${err.message}`);
    await db.end();
    process.exit(1);
  }
}
console.log(applied ? `${applied} migration(s) applied.` : "Nothing to apply; the database is up to date.");

// Deleting a user must take their sessions, logins and workspace membership with it,
// and deleting a workspace must take every row in it. That rests on real foreign keys
// (MySQL ignores inline REFERENCES), so check they exist rather than trust the DDL.
const [fks] = await db.query(
  "SELECT table_name AS t, referenced_table_name AS ref, delete_rule AS r FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE()",
);
const cascades = new Set(fks.filter((f) => f.r === "CASCADE").map((f) => `${f.t}->${f.ref}`));
const expected = [
  "session->user",
  "account->user",
  "memberships->user",
  "memberships->workspaces",
  "jobs->workspaces",
  "listings->jobs",
  "media->workspaces",
];
const missing = expected.filter((e) => !cascades.has(e));
if (missing.length) {
  console.warn(
    `WARNING: missing ON DELETE CASCADE: ${missing.join(", ")}. Deleting an account or workspace would leave rows behind.`,
  );
} else {
  console.log(`Foreign keys OK (${co}): users and workspaces cascade to their rows.`);
}
await db.end();
