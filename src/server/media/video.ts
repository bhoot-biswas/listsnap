import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { VIDEO_MAX_S } from "@/lib/schemas/video";

const run = promisify(execFile);
const FF = ["-hide_banner", "-loglevel", "error", "-y"];

/**
 * A seller's video, unpacked for the watch step in a temporary folder: ffmpeg needs a
 * file it can seek in (an iPhone MOV keeps its index at the end), and makes from it the
 * sound for Muse Voice Transcribe, a small silent copy for Muse Spark Open, and the
 * frames that become product photos. `done` removes the folder.
 */
export async function openVideo(data: Buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "listsnap-video-"));
  const file = path.join(dir, "video");
  await writeFile(file, data);
  const at = (name: string) => path.join(dir, name);

  return {
    /** The length in seconds; null when ffprobe can't read it as a video. */
    async seconds(): Promise<number | null> {
      try {
        const probe = ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration", "-of", "csv=p=0"];
        const { stdout } = await run("ffprobe", [...probe, file]);
        const s = Number(stdout.trim());
        return Number.isFinite(s) && s > 0 ? s : null;
      } catch {
        return null;
      }
    },

    /** The sound as Transcribe's mono 24 kHz WAV; null for a video with no sound. */
    async sound(): Promise<Buffer | null> {
      try {
        const out = ["-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", at("sound.wav")];
        await run("ffmpeg", [...FF, "-i", file, "-vn", "-t", `${VIDEO_MAX_S}`, ...out]);
        return await readFile(at("sound.wav"));
      } catch {
        return null;
      }
    },

    /**
     * A silent 720p H.264 copy at 15 frames a second: Spark Open samples at most 96 frames
     * and ignores sound, and a small file keeps the request well under its limits.
     */
    async small(): Promise<Buffer> {
      const scale = ["-an", "-t", `${VIDEO_MAX_S}`, "-vf", "scale=-2:'min(720,ih)',fps=15"];
      const h264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p"];
      await run("ffmpeg", [...FF, "-i", file, ...scale, ...h264, at("small.mp4")], { timeout: 120_000 });
      return readFile(at("small.mp4"));
    },

    /** One full-size frame at `second`, as a JPEG; null past the end. */
    async frame(second: number): Promise<Buffer | null> {
      const out = at(`frame-${Math.round(second * 1000)}.jpg`);
      try {
        await run("ffmpeg", [...FF, "-ss", second.toFixed(3), "-i", file, "-frames:v", "1", "-q:v", "2", out]);
        return await readFile(out);
      } catch {
        return null;
      }
    },

    done: () => rm(dir, { recursive: true, force: true }),
  };
}
