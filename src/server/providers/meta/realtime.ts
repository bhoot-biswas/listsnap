import "server-only";
import { z } from "zod";
import { env } from "@/server/env";
import { Pacer, TICK_MS } from "@/server/dictation/pacer";
import { PermanentError } from "@/server/pipeline/run-step";
import { guard, record } from "../breaker";
import { logged } from "../log";
import type { CallContext, LiveEvents, LiveFailure, LiveTranscription } from "../types";
import { BUSY } from "./spark";
import { LANGUAGES, PRICE_PER_HOUR, TRANSCRIBE_MODEL } from "./transcribe";

/**
 * Muse Voice Transcribe's realtime socket, for words that appear while the seller talks.
 * The browser can't hold the API key (it also pays for Spark, Image and SAM), so the
 * phone's audio comes to us and this holds the socket. PUSH_TO_TALK, as for the one-shot
 * call: the seller's tap decides where the message ends.
 */

const REALTIME_URL = "wss://api.meta.ai/v1/asr/realtime";
const HANDSHAKE_MS = 10_000;
/** After endStream the final came back in under a second in the spike. */
const FINAL_MS = 10_000;

const Ack = z.object({ sessionId: z.string() });
const Event = z.object({
  type: z.string(),
  transcript: z.string().nullish(),
  final: z.boolean().nullish(),
  audioProcessedMs: z.number().nullish(),
  message: z.string().nullish(),
});

const info = { provider: "meta", model: TRANSCRIBE_MODEL, endpoint: "asr/realtime", mode: "live" } as const;

export function liveTranscribeLive(ctx: CallContext, keywords: string[], events: LiveEvents): LiveTranscription {
  const key = env().modelApiKey;
  if (!key) throw new PermanentError("PROVIDER_MODE_META=live needs MODEL_API_KEY.");
  guard("transcribe", BUSY);

  const pacer = new Pacer();
  let socket: WebSocket | null = null;
  let acked = false;
  let settled = false;
  let processedMs = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let resolve!: (r: { text: string; ms: number }) => void;
  let reject!: (err: Error) => void;
  const done = new Promise<{ text: string; ms: number }>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const stop = () => {
    if (timer) clearTimeout(timer);
    if (deadline) clearTimeout(deadline);
    timer = deadline = null;
    try {
      socket?.close();
    } catch {
      // already closing
    }
  };
  const fail = (reason: LiveFailure, why: string, outage = false) => {
    if (settled) return;
    settled = true;
    if (outage) record("transcribe", false);
    stop();
    reject(new Error(why));
    events.failed(reason);
  };

  // the pacer's ticks run on an absolute schedule; a flat sleep drifts below real time
  let ticks = 0;
  let started = 0;
  const tick = () => {
    if (settled || !socket) return;
    const result = pacer.tick(performance.now());
    if (result.state === "lost") return fail("lost", `phone audio ${result.reason}`);
    for (const frame of result.frames) if (frame.length) socket.send(frame);
    if (result.state === "drained") {
      socket.send(JSON.stringify({ type: "endStream" }));
      deadline = setTimeout(() => fail("busy", "no final after endStream", true), FINAL_MS);
      return;
    }
    ticks++;
    timer = setTimeout(tick, Math.max(0, started + ticks * TICK_MS - performance.now()));
  };

  try {
    socket = new WebSocket(REALTIME_URL);
  } catch (err) {
    console.warn("[transcribe-live] could not connect:", err instanceof Error ? err.message : err);
    record("transcribe", false);
    throw err;
  }
  socket.binaryType = "arraybuffer";
  deadline = setTimeout(() => fail("busy", "no handshake answer", true), HANDSHAKE_MS);

  socket.onopen = () => {
    const handshake = {
      authorization: { accessToken: `Bearer ${key}` },
      model: TRANSCRIBE_MODEL,
      mode: "PUSH_TO_TALK",
      audioEncoding: "PCM_24KHZ",
      partialMode: "CUMULATIVE",
      emitAudioProgress: false,
      languageBias: LANGUAGES,
      ...(keywords.length ? { keywords } : {}),
    };
    socket?.send(JSON.stringify(handshake));
  };
  socket.onmessage = (e) => {
    if (typeof e.data !== "string" || settled) return;
    let raw: unknown;
    try {
      raw = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!acked) {
      if (!Ack.safeParse(raw).success) return;
      acked = true;
      if (deadline) clearTimeout(deadline);
      deadline = null;
      started = performance.now();
      tick();
      return;
    }
    const m = Event.safeParse(raw);
    // unknown event types are Meta's to add; only these two matter here
    if (!m.success) return;
    if (m.data.type === "error") console.warn("[transcribe-live] error event:", m.data.message?.slice(0, 200));
    if (m.data.type !== "transcript") return;
    processedMs = Math.max(processedMs, m.data.audioProcessedMs ?? 0);
    const text = (m.data.transcript ?? "").trim();
    if (!m.data.final) return events.partial(text);
    settled = true;
    record("transcribe", true);
    stop();
    resolve({ text, ms: Math.max(processedMs, pacer.sentMs) });
    events.final(text);
  };
  socket.onclose = (e) => {
    if (settled) return;
    console.warn(`[transcribe-live] closed ${e.code}: ${e.reason.slice(0, 200)}`);
    // 1008 is a refused request or our pacing: our bug, not an outage
    fail(e.code === 1013 || e.code === 1011 ? "busy" : "generic", `socket closed ${e.code}`, e.code !== 1008);
  };
  socket.onerror = () => {
    // a close always follows, with the code
  };

  void logged(
    ctx,
    info,
    () => done,
    // billed per whole second the engine heard; the words stay out of the log, like photos
    (r) => ({
      summary: `${(r.ms / 1000).toFixed(1)} s heard live · ${r.text.length} characters · ${Math.round(pacer.silencePaddedMs)} ms padded`,
      costUsd: (Math.floor(r.ms / 1000) / 3600) * PRICE_PER_HOUR,
    }),
  ).catch(() => {
    // the failure is logged and the browser already told
  });

  return {
    push: (pcm) => !settled && pacer.push(pcm, performance.now()),
    end: () => pacer.finish(),
    cancel: () => {
      if (settled) return;
      settled = true;
      stop();
      reject(new Error("seller left"));
    },
  };
}
