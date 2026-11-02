import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto, sampleVideo } from "./db-helpers";

// What one visitor can use across all their demo shops: a new demo shop is free to make,
// so it must not bring a fresh day of videos, AI photos or chat with it.
const enabled = dbEnv();

describe.skipIf(!enabled)("a demo visitor's daily allowance (MariaDB)", async () => {
  const { execute, getPool, select } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { DEMO_PER_IP, demoIpLimit } = await import("@/server/db/limits");
  const { env } = await import("@/server/env");
  const { takeDemoAllowance } = await import("@/server/limits");
  const { saveMedia } = await import("@/server/media/store");
  const { executeListingStep, executeWatchStep } = await import("@/server/pipeline/execute");

  // a fresh address each run, so a run doesn't inherit today's counts from the last one
  const ip = `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`;
  const v6 = `2001:db8:${randomInt(0, 0xffff).toString(16)}:${randomInt(0, 0xffff).toString(16)}`;
  const hashes = [ip, `${v6}::1`].map((a) => demoIpLimit.hash(a, env().authSecret));

  const real = await createTestWorkspace({ scenes: ["studio"], listingLanguages: ["en"] });
  const other = await createTestWorkspace();
  const demo = { ...real.workspace, isDemo: true };
  const otherDemo = { ...other.workspace, isDemo: true };

  afterAll(async () => {
    await execute(`DELETE FROM ip_daily WHERE ip_hash IN (${hashes.map(() => "?").join(", ")})`, hashes);
    await real.remove();
    await other.remove();
    await getPool().end();
  });

  it("counts a visitor's videos across their demo shops, and never limits a real shop", async () => {
    for (let i = 0; i < DEMO_PER_IP.videos; i++) {
      const shop = i % 2 ? demo : otherDemo;
      expect(await takeDemoAllowance(shop, ip, "videos")).not.toBeNull();
    }
    expect(await takeDemoAllowance(demo, ip, "videos")).toBeNull();
    expect(await takeDemoAllowance(otherDemo, ip, "videos")).toBeNull();
    expect(await takeDemoAllowance(real.workspace, ip, "videos")).not.toBeNull();
  });

  it("gives an allowance back when the work it was for never happened", async () => {
    const release = await takeDemoAllowance(demo, ip, "ai_calls");
    const [before] = await select<{ ai_calls: number }>("SELECT ai_calls FROM ip_daily WHERE ip_hash = ?", [
      hashes[0]!,
    ]);
    await release!();
    const [after] = await select<{ ai_calls: number }>("SELECT ai_calls FROM ip_daily WHERE ip_hash = ?", [hashes[0]!]);
    expect(after!.ai_calls).toBe(before!.ai_calls - 1);
  });

  it("counts every address in one IPv6 /64 as one visitor", async () => {
    for (let i = 0; i < DEMO_PER_IP.videos; i++)
      expect(await takeDemoAllowance(demo, `${v6}::${(i + 1).toString(16)}`, "videos")).not.toBeNull();
    expect(await takeDemoAllowance(demo, `${v6}:0:0:0:ffff`, "videos")).toBeNull();
  });

  it("stops at the visitor's AI photos without using the shop's own", async () => {
    const jobId = await createTestJob(real.workspace.id, await samplePhoto("saree.jpg"));
    const state = await runJob(real.workspace, jobId);
    const listingId = state.listings[0]!.id;
    const ws = forWorkspace(real.workspace.id);
    const used = (await ws.usageToday()).images;

    // the visitor has made a demo shop's worth of AI photos elsewhere today
    for (let i = 0; i < DEMO_PER_IP.images; i++) await demoIpLimit.reserve(hashes[0]!, "images");
    const r = await executeListingStep(demo, listingId, "render", { scene: "banner", ip });
    expect(r).toMatchObject({ found: true, outcome: { state: "failed", exhausted: true } });
    expect((await ws.usageToday()).images).toBe(used);
  });

  it("doesn't watch a video for a visitor already at today's listings", async () => {
    const ws = forWorkspace(other.workspace.id);
    const media = await saveMedia(ws.id, "video", await sampleVideo(), {
      mime: "video/mp4",
      width: 0,
      height: 0,
      selected: false,
    });
    const batchId = await ws.createVideoBatch(media.id);
    for (let i = 0; i < DEMO_PER_IP.listings; i++) await demoIpLimit.reserve(hashes[0]!, "listings");
    const listingsBefore = (await ws.usageToday()).listings;

    const r = await executeWatchStep(otherDemo, batchId, ip);
    expect(r).toMatchObject({ found: true, outcome: { state: "failed", exhausted: true } });
    // the paid models were never called, and the shop's own slot came back
    const calls = await select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM api_calls WHERE workspace_id = ? AND step = 'watch'",
      [ws.id],
    );
    expect(Number(calls[0]!.n)).toBe(0);
    expect((await ws.usageToday()).listings).toBe(listingsBefore);
  });
});
