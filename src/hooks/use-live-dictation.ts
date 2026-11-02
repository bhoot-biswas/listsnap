"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE_NOTE_MAX_S } from "@/lib/schemas/voice-note";
import { DictationEvent } from "@/lib/schemas/dictation";
import { RECORDING_TYPES, recordingFile, type RecorderProblem } from "@/hooks/use-recorder";

export type DictationPhase = "idle" | "listening" | "writing";

/** Give up on live words and send the recording whole after this long. */
const DRAIN_MS = 3000;
const FINAL_MS = 10_000;

const wait = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

interface Session {
  abort: AbortController;
  ctx: AudioContext | null;
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
  node: AudioWorkletNode | null;
  rec: MediaRecorder | null;
  chunks: Blob[];
  /** Still worth sending audio live; false once anything on the live path failed. */
  live: boolean;
  id: string | null;
  seq: number;
  queue: ArrayBuffer[];
  uploading: boolean;
  drained: (() => void) | null;
  final: string | null;
  settled: (() => void) | null;
}

/**
 * Talk and watch the words appear: the microphone goes to /api/dictate as 24 kHz PCM
 * while a normal recording runs alongside. The live words are a preview; if anything on
 * the live path fails, the recording goes to /api/transcribe whole when the seller
 * stops, so they still get their words, a few seconds later. A voice note, whose
 * recording is the thing kept, gets the recording back as soon as it stops and skips
 * that second try (`writeDown: false`).
 */
export function useLiveDictation({
  onWords,
  onDone,
  onFail,
  onRecorded,
  writeDown = true,
  maxSeconds = VOICE_NOTE_MAX_S,
}: {
  /** The words so far; each call replaces the last. */
  onWords: (text: string) => void;
  /** The finished words, possibly empty when nothing was heard. */
  onDone: (text: string) => void;
  /** Nothing came back; the server's words for why, when it said. */
  onFail: (message: string | null) => void;
  /** The whole recording, the moment the seller stops; before the last words arrive. */
  onRecorded?: (file: File) => void;
  /** Send the recording to /api/transcribe when the live words didn't make it. */
  writeDown?: boolean;
  maxSeconds?: number;
}) {
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<RecorderProblem | null>(null);
  const session = useRef<Session | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cb = useRef({ onWords, onDone, onFail, onRecorded });
  useEffect(() => {
    cb.current = { onWords, onDone, onFail, onRecorded };
  });

  const release = (s: Session) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    s.source?.disconnect();
    s.stream?.getTracks().forEach((tr) => tr.stop());
    void s.ctx?.close().catch(() => {});
  };

  // let go of the microphone and the live session when the page goes away
  useEffect(
    () => () => {
      const s = session.current;
      if (!s) return;
      s.abort.abort();
      if (s.rec?.state === "recording") {
        s.rec.onstop = null;
        s.rec.stop();
      }
      release(s);
    },
    [],
  );

  const pump = async (s: Session) => {
    if (s.uploading || !s.id) return;
    s.uploading = true;
    while (s.live && s.queue.length) {
      const body = s.queue.shift()!;
      const res = await fetch(`/api/dictate/${s.id}/audio?seq=${s.seq}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body,
        signal: s.abort.signal,
      }).catch(() => null);
      if (!res?.ok) s.live = false;
      else s.seq++;
    }
    s.uploading = false;
    s.drained?.();
  };

  const listen = async (s: Session) => {
    const res = await fetch("/api/dictate", { method: "POST", signal: s.abort.signal }).catch(() => null);
    if (res?.ok && res.body) {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let carry = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const lines = (carry + value).split("\n");
          carry = lines.pop() ?? "";
          for (const line of lines) {
            const e = DictationEvent.safeParse(JSON.parse(line || "null"));
            if (!e.success) continue;
            if (e.data.type === "ready") {
              s.id = e.data.id;
              void pump(s);
            } else if (e.data.type === "partial") {
              if (s.live && session.current === s) cb.current.onWords(e.data.text);
            } else if (e.data.type === "final") s.final = e.data.text;
            else s.live = false;
          }
        }
      } catch {
        // a dropped connection; the recording still goes up whole
      }
    }
    if (s.final === null) s.live = false;
    s.settled?.();
  };

  /** Resolves false when there's no microphone to record with, or the seller said no. */
  const start = async (): Promise<boolean> => {
    setProblem(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setProblem("unsupported");
      return false;
    }
    const canStream = typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";
    const s: Session = {
      abort: new AbortController(),
      // made inside the tap, or iPhone Safari keeps it silent
      ctx: canStream ? new AudioContext() : null,
      stream: null,
      source: null,
      node: null,
      rec: null,
      chunks: [],
      live: canStream,
      id: null,
      seq: 0,
      queue: [],
      uploading: false,
      drained: null,
      final: null,
      settled: null,
    };
    void s.ctx?.resume().catch(() => {});
    session.current = s;
    // connect while the permission prompt is up: the handshake takes a second or so
    if (canStream) void listen(s);

    try {
      s.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      s.abort.abort();
      release(s);
      session.current = null;
      setProblem("denied");
      return false;
    }

    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    s.rec = new MediaRecorder(s.stream, mimeType ? { mimeType } : undefined);
    s.rec.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
    s.rec.start();

    if (s.ctx) {
      try {
        await s.ctx.audioWorklet.addModule("/dictation-worklet.js");
        s.source = s.ctx.createMediaStreamSource(s.stream);
        s.node = new AudioWorkletNode(s.ctx, "pcm-24k");
        // a silent path to the speakers keeps the browser pulling audio through the worklet
        const mute = s.ctx.createGain();
        mute.gain.value = 0;
        s.source.connect(s.node).connect(mute).connect(s.ctx.destination);
        s.node.port.onmessage = (e) => {
          if (!(e.data instanceof ArrayBuffer) || !s.live) return;
          s.queue.push(e.data);
          void pump(s);
        };
      } catch {
        s.live = false;
      }
    }

    setSeconds(0);
    setPhase("listening");
    const began = Date.now();
    timer.current = setInterval(() => {
      const sec = Math.floor((Date.now() - began) / 1000);
      setSeconds(sec);
      if (sec >= maxSeconds) void stop();
    }, 250);
    return true;
  };

  const stop = async () => {
    const s = session.current;
    if (!s?.rec || s.rec.state !== "recording") return;
    setPhase("writing");
    if (timer.current) clearInterval(timer.current);
    timer.current = null;

    // the worklet's last part-block, then the microphone goes
    if (s.node) {
      const node = s.node;
      await wait(
        new Promise<void>((r) => {
          node.port.onmessage = (e) => {
            if (e.data instanceof ArrayBuffer) {
              if (s.live) s.queue.push(e.data);
              void pump(s);
            } else if (e.data === "flushed") r();
          };
          node.port.postMessage("flush");
        }),
        500,
      );
    }
    const rec = s.rec;
    const file = new Promise<File>((r) => {
      rec.onstop = () => r(recordingFile(s.chunks, rec.mimeType || "audio/webm"));
    });
    rec.stop();
    release(s);
    if (cb.current.onRecorded) {
      const f = await file;
      if (session.current === s) cb.current.onRecorded(f);
    }

    let text: string | null = null;
    if (s.live && s.id) {
      if (s.uploading || s.queue.length) await wait(new Promise<void>((r) => (s.drained = r)), DRAIN_MS);
      if (s.live && !s.queue.length) {
        const settled = s.final !== null ? Promise.resolve() : new Promise<void>((r) => (s.settled = r));
        const ended = await fetch(`/api/dictate/${s.id}/end`, { method: "POST", signal: s.abort.signal }).catch(
          () => null,
        );
        if (ended?.ok) await wait(settled, FINAL_MS);
        if (s.live) text = s.final;
      }
    }
    s.abort.abort();
    if (session.current !== s) return;

    if (text === null && !writeDown) {
      session.current = null;
      setPhase("idle");
      return cb.current.onFail(null);
    }
    if (text === null) {
      // the live words didn't make it: the whole recording, the way it worked before
      try {
        const form = new FormData();
        const f = await file;
        form.append("audio", f, f.name);
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          session.current = null;
          setPhase("idle");
          return cb.current.onFail(typeof body?.error?.message === "string" ? body.error.message : null);
        }
        text = typeof body?.text === "string" ? body.text : "";
      } catch {
        session.current = null;
        setPhase("idle");
        return cb.current.onFail(null);
      }
    }
    session.current = null;
    setPhase("idle");
    cb.current.onDone((text ?? "").trim());
  };

  // a phone that locks or switches app stops sending sound; finish with what was said
  useEffect(() => {
    if (phase !== "listening") return;
    const hidden = () => document.visibilityState === "hidden" && void stop();
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  });

  return { phase, seconds, problem, start, stop };
}
