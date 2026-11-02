import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openVideo } from "./video";
import { normaliseVoice } from "./voice";

// Uploads are read only as what a phone records: a playlist (which can open other files)
// or any other format sent as a video or voice note is turned down, not decoded.
const ff = (args: string[]) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args, "pipe:1"], { maxBuffer: 20 * 1024 * 1024 });

const playlist = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "listsnap-ff-"));
  writeFileSync(path.join(dir, "secret.txt"), "not for sellers\n");
  return Buffer.from(`#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile://${dir}/secret.txt\n#EXT-X-ENDLIST\n`);
};

describe("video input", () => {
  it("reads an MP4 and a WebM", async () => {
    const mp4 = ff(
      ["-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p"].concat(
        ["-movflags", "frag_keyframe+empty_moov", "-f", "mp4"],
      ),
    );
    // written to a file, as a phone saves it: a piped WebM has no length to read
    const file = path.join(mkdtempSync(path.join(tmpdir(), "listsnap-ff-")), "v.webm");
    execFileSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error"].concat(
        ["-f", "lavfi", "-i"],
        ["testsrc=size=160x120:rate=10:duration=1", "-c:v", "libvpx", file],
      ),
    );
    const webm = readFileSync(file);
    for (const data of [mp4, webm]) {
      const video = await openVideo(data);
      try {
        expect(await video.seconds()).toBeGreaterThan(0);
      } finally {
        await video.done();
      }
    }
  });

  it("turns down a playlist and an audio file sent as a video", async () => {
    const wav = ff(["-f", "lavfi", "-i", "sine=duration=1", "-f", "wav"]);
    for (const data of [playlist(), wav]) {
      const video = await openVideo(data);
      try {
        expect(await video.seconds()).toBeNull();
      } finally {
        await video.done();
      }
    }
  });
});

describe("voice note input", () => {
  it("reads WebM/Opus, MP4/AAC and Ogg recordings", async () => {
    const tone = ["-f", "lavfi", "-i", "sine=duration=1"];
    const recordings = [
      ff([...tone, "-c:a", "libopus", "-f", "webm"]),
      ff([...tone, "-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4"]),
      ff([...tone, "-c:a", "libopus", "-f", "ogg"]),
    ];
    for (const r of recordings) expect((await normaliseVoice(r))?.seconds).toBeGreaterThan(0.5);
  });

  it("turns down a playlist", async () => {
    expect(await normaliseVoice(playlist())).toBeNull();
  });
});
