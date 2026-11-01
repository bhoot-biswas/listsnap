import "server-only";
import { spawn } from "node:child_process";
import { fail } from "@/server/http";
import { VOICE_NOTE_MAX_S } from "@/lib/schemas/voice-note";

/** A minute of Opus from a phone is well under 1 MB; this leaves room for M4A and WAV. */
const MAX_BYTES = 10 * 1024 * 1024;
const RATE = 24_000;
const WAV_OUT = ["-t", `${VOICE_NOTE_MAX_S}`, "-ac", "1", "-ar", `${RATE}`, "-c:a", "pcm_s16le", "-f", "wav", "pipe:1"];

/** Why an uploaded voice note can't be used, as the response to send; null when it looks fine. */
export function voiceFileProblem(f: File): Promise<Response> | null {
  if (f.type && !f.type.startsWith("audio/") && f.type !== "video/webm")
    return fail(415, "unsupported_file", "notVoiceNote");
  if (f.size > MAX_BYTES) return fail(413, "too_large", "voiceNoteTooLarge");
  return null;
}

/**
 * Any recording the browser makes (WebM/Opus on Android Chrome, MP4/AAC on iPhone Safari)
 * as mono 16-bit 24 kHz WAV: the only format Muse Voice Transcribe takes, at its native
 * rate. ffmpeg drops every tag and stops at the length limit. Null when it isn't audio
 * ffmpeg can read, or holds no sound at all.
 */
export async function normaliseVoice(input: Buffer): Promise<{ data: Buffer; seconds: number } | null> {
  const out = await new Promise<Buffer | null>((resolve) => {
    const ff = spawn(
      "ffmpeg",
      [...["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-map_metadata", "-1"], ...WAV_OUT],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let err = "";
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stderr.on("data", (c: Buffer) => (err += c.toString()));
    // a missing ffmpeg is our problem, not the seller's file: say so in the log
    ff.on("error", (e) => {
      console.error("[voice] ffmpeg could not start:", e.message);
      resolve(null);
    });
    ff.on("close", (code) => {
      if (code !== 0) console.warn("[voice] ffmpeg could not read a voice note:", err.slice(0, 300));
      resolve(code === 0 ? Buffer.concat(chunks) : null);
    });
    // the reader may stop early on a bad file; that error is reported by the exit code
    ff.stdin.on("error", () => {});
    ff.stdin.end(input);
  });
  // a piped WAV's header can't hold the length, so it comes from the data: 2 bytes a sample
  if (!out || out.length <= 44) return null;
  const seconds = (out.length - 44) / (RATE * 2);
  if (seconds < 0.5) return null;
  return { data: fixWavSizes(out), seconds };
}

/** ffmpeg writing to a pipe can't go back to fill in the RIFF and data sizes; some readers need them. */
function fixWavSizes(wav: Buffer): Buffer {
  const dataAt = wav.indexOf("data", 12, "ascii");
  if (dataAt < 0) return wav;
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.writeUInt32LE(wav.length - dataAt - 8, dataAt + 4);
  return wav;
}

export const unreadableVoice = () => fail(415, "unsupported_file", "unreadableVoiceNote");
