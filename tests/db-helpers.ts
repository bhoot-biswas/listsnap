import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

/**
 * Shared setup for tests that run against the local MariaDB (pnpm db:up && pnpm db:migrate).
 * Call dbEnv() before importing any server module: env() is read once per test file, and
 * these tests must use mock providers and a throwaway media folder whatever .env.local says.
 */
export function dbEnv(): boolean {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "listsnap-media-"));
  process.env.PROVIDER_MODE_META = "mock";
  process.env.PROVIDER_MODE_WOO = "mock";
  process.env.PROVIDER_MODE_INSTAGRAM = "mock";
  process.env.PROVIDER_MODE_VIDEO = "mock";
  process.env.MOCK_DELAY_MS = "0";
  return !!process.env.DATABASE_URL;
}

export const samplePhoto = (name: string) => readFile(path.join(process.cwd(), "public", "samples", name));

/** Three copies side by side: the mock planner treats a photo twice as wide as tall as three designs. */
export async function widePhoto(): Promise<Buffer> {
  const tile = await sharp(await samplePhoto("saree.jpg"))
    .resize(400, 400)
    .jpeg()
    .toBuffer();
  return sharp({ create: { width: 1200, height: 400, channels: 3, background: "#fff" } })
    .composite([0, 1, 2].map((i) => ({ input: tile, left: i * 400, top: 0 })))
    .jpeg()
    .toBuffer();
}

export async function createTestWorkspace(settings: Record<string, unknown> = {}) {
  const { execute, json } = await import("@/server/db/pool");
  const { DEFAULT_SETTINGS } = await import("@/server/db/workspaces");
  const id = randomUUID();
  await execute("INSERT INTO workspaces (id, name, settings_json) VALUES (?, 'test shop', ?)", [
    id,
    json({ ...DEFAULT_SETTINGS, ...settings }),
  ]);
  const { selectOne } = await import("@/server/db/pool");
  const row = await selectOne<{ daily_listing_limit: number; daily_image_limit: number }>(
    "SELECT daily_listing_limit, daily_image_limit FROM workspaces WHERE id = ?",
    [id],
  );
  const workspace = {
    id,
    name: "test shop",
    isDemo: false,
    expiresAt: null,
    onboarded: true,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    limits: { listings: row!.daily_listing_limit, images: row!.daily_image_limit },
  };
  return { workspace, remove: () => execute("DELETE FROM workspaces WHERE id = ?", [id]) };
}

/** Uploads a photo the way the upload route does: normalised, saved as media, then a job. */
export async function createTestJob(workspaceId: string, photo: Buffer): Promise<string> {
  const { normalisePhoto, saveMedia } = await import("@/server/media/store");
  const { forWorkspace } = await import("@/server/db/scope");
  const p = await normalisePhoto(photo);
  const media = await saveMedia(workspaceId, "original", p.data, {
    mime: "image/jpeg",
    width: p.width,
    height: p.height,
  });
  return forWorkspace(workspaceId).createJob([{ mediaId: media.id, width: p.width, height: p.height }]);
}

type Workspace = Awaited<ReturnType<typeof createTestWorkspace>>["workspace"];

/**
 * Plays the browser's part: asks for the next calls, makes them all at once (as the
 * client does), and repeats until nothing is left. The URLs are parsed rather than the
 * step names read directly, so the URL contract the client relies on is tested too.
 */
export async function runJob(workspace: Workspace, jobId: string, maxRounds = 20) {
  const { loadJobState } = await import("@/server/pipeline/job-state");
  const { executeJobStep, executeListingStep } = await import("@/server/pipeline/execute");
  for (let round = 0; round < maxRounds; round++) {
    const state = await loadJobState(workspace, jobId);
    if (!state) throw new Error("job vanished");
    if (!state.next.length) return state;
    await Promise.all(
      state.next.map(async ({ url }) => {
        const u = new URL(url, "http://test");
        const job = u.pathname.match(/^\/api\/jobs\/([^/]+)\/steps\/(plan|segment|group)$/);
        const listing = u.pathname.match(/^\/api\/listings\/([^/]+)\/steps\/(write|translate|render)$/);
        if (job) return executeJobStep(workspace, job[1]!, job[2] as "plan" | "segment" | "group");
        if (listing)
          return executeListingStep(workspace, listing[1]!, listing[2] as "write" | "translate" | "render", {
            scene: u.searchParams.get("scene") ?? undefined,
          });
        throw new Error(`unexpected next call ${url}`);
      }),
    );
  }
  throw new Error(`job ${jobId} didn't settle in ${maxRounds} rounds`);
}
