import "server-only";
import { z } from "zod";
import { env } from "@/server/env";
import { PermanentError, StepError } from "@/server/pipeline/run-step";
import { guard, noteRateLimit, record } from "../breaker";
import { logged } from "../log";
import type { CallContext, Transcript } from "../types";
import { BASE_URL, BUSY } from "./spark";

/**
 * Muse Voice Transcribe's one-shot endpoint: the whole voice note in one multipart POST,
 * in PUSH_TO_TALK mode, since the seller decides where the note ends. A minute of audio
 * comes back in about 5 s, so a short timeout leaves the listen step room for its retry.
 */

export const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
const PRICE_PER_HOUR = 0.18;
// a minute came back in about 5 s; a video's few minutes get more room
const timeoutMs = (wav: Buffer) => 20_000 + Math.round((wav.length / 48_000) * 500);

/**
 * Sellers mix Bangla and English. The spike found keywords must be in Bangla script:
 * English ones pulled the whole transcript into Latin letters.
 */
const LANGUAGES = ["Bengali", "English"];

const Response = z.object({
  transcript: z.string(),
  audioDurationMs: z.number().nullish(),
  turns: z
    .array(z.object({ startMs: z.number().nullish(), endMs: z.number().nullish(), transcript: z.string().nullish() }))
    .nullish(),
});

const info = { provider: "meta", model: TRANSCRIBE_MODEL, endpoint: "asr/transcribe", mode: "live" } as const;

/**
 * `turns` switches to ENDPOINTING, where the model finds where each spoken turn starts and
 * ends: a video's words then line up with what was on screen.
 */
export function liveTranscribe(ctx: CallContext, wav: Buffer, keywords: string[], turns = false): Promise<Transcript> {
  return logged(
    ctx,
    info,
    async () => {
      const key = env().modelApiKey;
      if (!key) throw new PermanentError("PROVIDER_MODE_META=live needs MODEL_API_KEY.");
      const form = new FormData();
      const mode = turns ? "ENDPOINTING" : "PUSH_TO_TALK";
      const request = { model: TRANSCRIBE_MODEL, mode, audioEncoding: "WAV", languageBias: LANGUAGES };
      form.append(
        "request",
        new Blob([JSON.stringify(keywords.length ? { ...request, keywords } : request)], { type: "application/json" }),
      );
      form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "note.wav");

      guard("transcribe", BUSY);
      let res: globalThis.Response;
      try {
        res = await fetch(`${BASE_URL}/asr/transcribe`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
          body: form,
          signal: AbortSignal.timeout(timeoutMs(wav)),
        });
      } catch (err) {
        console.warn("[transcribe] request failed:", err instanceof Error ? err.message : err);
        record("transcribe", false);
        throw new StepError(BUSY);
      }
      noteRateLimit("transcribe", res.headers);
      if (res.status === 429 || res.status >= 500) {
        record("transcribe", false);
        throw new StepError(BUSY);
      }
      record("transcribe", true);
      if (!res.ok)
        throw new PermanentError(`Muse Voice Transcribe HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = Response.safeParse(await res.json().catch(() => null));
      if (!body.success) throw new Error("Muse Voice Transcribe sent an unexpected response");
      return {
        text: body.data.transcript.trim(),
        seconds: (body.data.audioDurationMs ?? 0) / 1000,
        turns: (body.data.turns ?? []).map((t) => ({
          startMs: t.startMs ?? 0,
          endMs: t.endMs ?? 0,
          text: (t.transcript ?? "").trim(),
        })),
      };
    },
    // billed per whole second of audio; the words stay out of the log, like photos
    (t) => ({
      summary: `${t.seconds.toFixed(1)} s heard · ${t.text.length} characters${turns ? ` · ${t.turns.length} turns` : ""}`,
      costUsd: (Math.floor(t.seconds) / 3600) * PRICE_PER_HOUR,
    }),
  );
}
