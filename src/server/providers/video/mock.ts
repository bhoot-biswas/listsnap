import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { logged } from "../log";
import type { VideoProvider } from "../types";

// a one-second plain 1080×1920 clip, so tests and CI never start Chrome
const PLACEHOLDER = path.join(/*turbopackIgnore: true*/ process.cwd(), "src/server/providers/video/placeholder.mp4");

export const mockVideo: VideoProvider = {
  mode: "mock",
  renderReel: (ctx, input) =>
    logged(
      ctx,
      { provider: "video", model: "hyperframes (mock)", endpoint: "render", mode: "mock" },
      async () => ({ data: await readFile(PLACEHOLDER), width: 1080, height: 1920, seconds: 0 }),
      () => ({ summary: `${input.template} ${input.variables.lang} · placeholder`, costUsd: 0 }),
    ),
};
