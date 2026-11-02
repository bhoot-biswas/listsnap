import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv, sampleVideo } from "./db-helpers";

/**
 * The nightly cleanup of what no seller needs any more: old videos, files no media row
 * names, and old log rows. A real run: everything it may delete is made old by this test,
 * and this file's media folder is its own.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("nightly cleanup of old videos, stray files and log rows (MariaDB)", async () => {
  const { execute, getPool, selectOne } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { saveMedia } = await import("@/server/media/store");
  const { loadBatchState } = await import("@/server/pipeline/batch-state");
  const { env } = await import("@/server/env");

  const shop = await createTestWorkspace();
  const ws = forWorkspace(shop.workspace.id);
  const run = () => promisify(execFile)("node", ["scripts/cleanup-old.mjs"], { env: process.env });
  const exists = (abs: string) =>
    stat(abs).then(
      () => true,
      () => false,
    );
  const abs = (rel: string) => path.join(env().mediaDir, rel);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  afterAll(async () => {
    await shop.remove();
    await getPool().end();
  });

  /** A video batch whose watch finished `days` ago, with `status`. */
  const videoBatch = async (days: number, status: "done" | "failed") => {
    const media = await saveMedia(ws.id, "video", await sampleVideo(1), {
      mime: "video/mp4",
      width: 0,
      height: 0,
      selected: false,
    });
    const batchId = await ws.createVideoBatch(media.id);
    await execute(
      `UPDATE batch_steps SET status = ?, attempts = 1, finished_at = UTC_TIMESTAMP(3) - INTERVAL ? DAY
        WHERE batch_id = ? AND step = 'watch'`,
      [status, days, batchId],
    );
    const row = await selectOne<{ path: string }>("SELECT path FROM media WHERE id = ?", [media.id]);
    return { batchId, mediaId: media.id, file: abs(row!.path) };
  };

  it("deletes videos a week after their watch, keeps newer ones and a failed watch's video", async () => {
    const old = await videoBatch(8, "done");
    const recent = await videoBatch(2, "done");
    const failedRecently = await videoBatch(8, "failed");
    const failedLongAgo = await videoBatch(31, "failed");

    await run();

    for (const gone of [old, failedLongAgo]) {
      expect(await selectOne("SELECT id FROM media WHERE id = ?", [gone.mediaId])).toBeNull();
      expect(await exists(gone.file)).toBe(false);
    }
    for (const kept of [recent, failedRecently]) {
      expect(await selectOne("SELECT id FROM media WHERE id = ?", [kept.mediaId])).not.toBeNull();
      expect(await exists(kept.file)).toBe(true);
    }
    // the batch still shows as one made from a video
    expect((await loadBatchState(shop.workspace, old.batchId))?.watch).not.toBeNull();
  });

  it("deletes day-old files no media row names, and keeps an image's small copies", async () => {
    const photo = await saveMedia(ws.id, "original", Buffer.from("jpeg"), { mime: "image/jpeg", width: 1, height: 1 });
    const photoPath = abs((await selectOne<{ path: string }>("SELECT path FROM media WHERE id = ?", [photo.id]))!.path);
    const dir = path.dirname(photoPath);
    await mkdir(dir, { recursive: true });
    const copy = `${photoPath}.w320.webp`;
    const stray = path.join(dir, `${randomUUID()}.jpg`);
    const strayCopy = path.join(dir, `${randomUUID()}.jpg.w96.webp`);
    const fresh = path.join(dir, `${randomUUID()}.jpg`);
    for (const f of [copy, stray, strayCopy, fresh]) await writeFile(f, "x");
    for (const f of [photoPath, copy, stray, strayCopy]) await utimes(f, daysAgo(2), daysAgo(2));

    await run();

    expect(await exists(photoPath)).toBe(true);
    expect(await exists(copy)).toBe(true);
    expect(await exists(stray)).toBe(false);
    expect(await exists(strayCopy)).toBe(false);
    // it may be an upload whose row is being written right now
    expect(await exists(fresh)).toBe(true);
  });

  it("deletes old log rows and keeps recent ones", async () => {
    const tag = randomUUID().slice(0, 8);
    const ipOld = `old-${tag}`.padEnd(64, "0");
    const ipNew = `new-${tag}`.padEnd(64, "0");
    await execute("INSERT INTO ip_daily (ip_hash, date) VALUES (?, UTC_DATE() - INTERVAL 100 DAY), (?, UTC_DATE())", [
      ipOld,
      ipNew,
    ]);
    await execute(
      `INSERT INTO shopify_webhooks (webhook_id, topic, shop, received_at) VALUES
         (?, 'app/uninstalled', 'x.myshopify.com', UTC_TIMESTAMP(3) - INTERVAL 40 DAY),
         (?, 'app/uninstalled', 'x.myshopify.com', UTC_TIMESTAMP(3))`,
      [`old-${tag}`, `new-${tag}`],
    );
    await execute(
      `INSERT INTO op_runs (workspace_id, op, via, idem_key, status, created_at) VALUES
         (?, 'probe', 'ui', ?, 'done', UTC_TIMESTAMP(3) - INTERVAL 100 DAY),
         (?, 'probe', 'ui', ?, 'done', UTC_TIMESTAMP(3))`,
      [ws.id, `old-${tag}`, ws.id, `new-${tag}`],
    );
    await execute(
      `INSERT INTO api_calls (workspace_id, provider, model, endpoint, step, mode, ms, cost_usd, ok, summary, created_at) VALUES
         (?, 'meta', 'probe', 'probe', 'probe', 'mock', 1, 0, 1, ?, UTC_TIMESTAMP(3) - INTERVAL 400 DAY),
         (?, 'meta', 'probe', 'probe', 'probe', 'mock', 1, 0, 1, ?, UTC_TIMESTAMP(3))`,
      [ws.id, `old-${tag}`, ws.id, `new-${tag}`],
    );

    await run();

    const count = async (sql: string, params: string[]) => Number((await selectOne<{ n: number }>(sql, params))!.n);
    expect(await count("SELECT COUNT(*) AS n FROM ip_daily WHERE ip_hash IN (?, ?)", [ipOld, ipNew])).toBe(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM shopify_webhooks WHERE webhook_id IN (?, ?)", [
        `old-${tag}`,
        `new-${tag}`,
      ]),
    ).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM op_runs WHERE workspace_id = ? AND op = 'probe'", [ws.id])).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM api_calls WHERE workspace_id = ? AND model = 'probe'", [ws.id])).toBe(
      1,
    );
    await execute("DELETE FROM ip_daily WHERE ip_hash = ?", [ipNew]);
    await execute("DELETE FROM shopify_webhooks WHERE webhook_id = ?", [`new-${tag}`]);
  });
});
