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
  process.env.PROVIDER_MODE_SHOPIFY = "mock";
  process.env.PROVIDER_MODE_INSTAGRAM = "mock";
  process.env.PROVIDER_MODE_FACEBOOK = "mock";
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
/** A job from one photo, with a voice note when `voice` (a WAV) is given. */
export async function createTestJob(workspaceId: string, photo: Buffer, voice?: Buffer): Promise<string> {
  const { normalisePhoto, saveMedia } = await import("@/server/media/store");
  const { forWorkspace } = await import("@/server/db/scope");
  const p = await normalisePhoto(photo);
  const media = await saveMedia(workspaceId, "original", p.data, {
    mime: "image/jpeg",
    width: p.width,
    height: p.height,
  });
  const note = voice
    ? await saveMedia(workspaceId, "voice", voice, { mime: "audio/wav", width: 0, height: 0, selected: false })
    : null;
  return forWorkspace(workspaceId).createJob(
    [{ mediaId: media.id, width: p.width, height: p.height }],
    undefined,
    note?.id,
  );
}

/** A second of quiet 24 kHz mono WAV: the mock "hears" its fixed transcript in anything. */
export function sampleVoice(seconds = 1): Buffer {
  const data = Buffer.alloc(24_000 * 2 * seconds);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8, "ascii");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(24_000, 24);
  head.writeUInt32LE(48_000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "ascii");
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
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
        const job = u.pathname.match(/^\/api\/jobs\/([^/]+)\/steps\/(plan|segment|group|listen)$/);
        const listing = u.pathname.match(/^\/api\/listings\/([^/]+)\/steps\/(write|translate|render)$/);
        if (job) return executeJobStep(workspace, job[1]!, job[2] as "plan" | "segment" | "group" | "listen");
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

/**
 * A few seconds of test-pattern video with a tone, made by ffmpeg (on the PATH here and on
 * GitHub's runners): enough for the watch step's sound, small copy and frames.
 */
export async function sampleVideo(seconds = 3): Promise<Buffer> {
  const { execFileSync } = await import("node:child_process");
  return execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=640x360:rate=15:duration=${seconds}`]
      .concat(["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-shortest"])
      .concat(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "frag_keyframe+empty_moov"])
      .concat(["-f", "mp4", "pipe:1"]),
    { maxBuffer: 50 * 1024 * 1024 },
  );
}
