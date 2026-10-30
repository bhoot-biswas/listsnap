import "server-only";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { env } from "@/server/env";
import { logged } from "../log";
import type { ReelPhotoFiles, VideoProvider } from "../types";

const run = promisify(execFile);

/** The CLI version in package.json; a render is only reproducible on the same one. */
export const HYPERFRAMES_VERSION = "0.8.217";

const ROOT = /*turbopackIgnore: true*/ process.cwd();
const fromRoot = (...p: string[]) => path.join(/*turbopackIgnore: true*/ ROOT, ...p);
const CLI = fromRoot("node_modules/hyperframes/bin/hyperframes.mjs");

// everything a template loads is copied next to it, so a render never touches the network
const ASSETS: [from: string, to: string][] = [
  ["node_modules/gsap/dist/gsap.min.js", "gsap.min.js"],
  [
    "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
    "fonts/bricolage-latin.woff2",
  ],
  [
    "node_modules/@fontsource/hind-siliguri/files/hind-siliguri-bengali-400-normal.woff2",
    "fonts/hind-bengali-400.woff2",
  ],
  [
    "node_modules/@fontsource/hind-siliguri/files/hind-siliguri-bengali-600-normal.woff2",
    "fonts/hind-bengali-600.woff2",
  ],
  ["node_modules/@fontsource/hind-siliguri/files/hind-siliguri-latin-400-normal.woff2", "fonts/hind-latin-400.woff2"],
  ["node_modules/@fontsource/hind-siliguri/files/hind-siliguri-latin-600-normal.woff2", "fonts/hind-latin-600.woff2"],
];

// a render takes about a minute of every core; past this something is stuck
const TIMEOUT_MS = 240_000;

/*
 * One render at a time per server: each one starts several Chrome workers, and two at
 * once would only make both slower and could run a small server out of memory.
 */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn);
  queue = next.catch(() => undefined);
  return next;
}

async function stage(dir: string, template: string, photos: ReelPhotoFiles) {
  await copyFile(fromRoot("src/server/reels/templates", template, "index.html"), path.join(dir, "index.html"));
  await mkdir(path.join(dir, "assets/fonts"), { recursive: true });
  await mkdir(path.join(dir, "assets/img"), { recursive: true });
  for (const [from, to] of ASSETS) await copyFile(fromRoot(from), path.join(dir, "assets", to));
  // photos are re-encoded at the size the frame needs, so a large PNG cutout can't slow the render
  for (const [name, data] of Object.entries(photos)) {
    const jpeg = await sharp(data)
      .resize({ width: 1600, height: 1600, fit: "inside" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    await writeFile(path.join(dir, "assets/img", `${name}.jpg`), jpeg);
  }
}

export const liveVideo: VideoProvider = {
  mode: "live",
  renderReel: (ctx, input) =>
    logged(
      ctx,
      { provider: "video", model: `hyperframes ${HYPERFRAMES_VERSION}`, endpoint: "render", mode: "live" },
      () =>
        oneAtATime(async () => {
          const started = performance.now();
          const dir = await mkdtemp(path.join(tmpdir(), "listsnap-reel-"));
          try {
            await stage(dir, input.template, input.photos);
            const out = path.join(dir, "reel.mp4");
            // inline JSON: in 0.8.217 both --variables-file and a --variables path fail to read the file
            const args = ["render", dir, "--variables", JSON.stringify(input.variables), "--strict-variables"];
            args.push("--workers", String(env().reelWorkers), "--quiet", "-o", out);
            await run(process.execPath, [CLI, ...args], {
              timeout: TIMEOUT_MS,
              maxBuffer: 16 * 1024 * 1024,
              windowsHide: true,
            }).catch((err: { stderr?: string; killed?: boolean }) => {
              // the CLI's own words, not the command line, so the log says what went wrong
              const why = err.killed ? "timed out" : (err.stderr ?? "").trim().split("\n").slice(-3).join(" ");
              throw new Error(`hyperframes render failed: ${why || "no output"}`);
            });
            const data = await readFile(out);
            return { data, width: 1080, height: 1920, seconds: Math.round((performance.now() - started) / 100) / 10 };
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        }),
      (r) => ({
        summary: `${input.template} ${input.variables.lang} · ${r.seconds} s · ${(r.data.length / 1e6).toFixed(1)} MB`,
        costUsd: 0,
      }),
    ),
};
