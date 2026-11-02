import "server-only";
import { logged } from "../log";
import type { CallContext, LiveEvents, LiveTranscription } from "../types";
import { BYTES_PER_MS } from "@/server/dictation/pacer";

/**
 * Live dictation without the socket: a word of the mock transcript appears for every
 * half second of audio, so the box fills as the seller talks, as it would live.
 */
export function mockTranscribeLive(ctx: CallContext, transcript: string, events: LiveEvents): LiveTranscription {
  const words = transcript.split(" ");
  let bytes = 0;
  let shown = 0;
  let over = false;
  let finish!: (ms: number) => void;
  let drop!: (err: Error) => void;
  const done = new Promise<number>((res, rej) => {
    finish = res;
    drop = rej;
  });

  void logged(
    ctx,
    { provider: "meta", model: "muse-voice-transcribe-1.0 (mock)", endpoint: "asr/realtime", mode: "mock" },
    () => done,
    (ms) => ({ summary: `${(ms / 1000).toFixed(1)} s heard live`, costUsd: 0 }),
  ).catch(() => {
    // a cancelled mock session has nothing to report
  });

  return {
    push(pcm) {
      if (over) return;
      bytes += pcm.length;
      const n = Math.min(words.length, Math.floor(bytes / BYTES_PER_MS / 500));
      if (n > shown) {
        shown = n;
        events.partial(words.slice(0, n).join(" "));
      }
    },
    end() {
      if (over) return;
      over = true;
      setTimeout(() => {
        finish(bytes / BYTES_PER_MS);
        events.final(bytes ? transcript : "");
      }, 300);
    },
    cancel() {
      over = true;
      drop(new Error("seller left"));
    },
  };
}
