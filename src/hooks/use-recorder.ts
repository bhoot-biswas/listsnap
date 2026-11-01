"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE_NOTE_MAX_S } from "@/lib/schemas/voice-note";

/** What the browser records in: Opus where it can (Chrome, Firefox), AAC in MP4 on Safari. */
const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

export type RecorderProblem = "unsupported" | "denied";

/**
 * The microphone, for Snap's voice note and the chat boxes: start, stop (or it stops at
 * the limit), and the recording handed over as a File the server can convert. The
 * microphone is let go as soon as recording stops, so the browser's recording dot goes.
 */
export function useRecorder(onDone: (file: File) => void, maxSeconds = VOICE_NOTE_MAX_S) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<RecorderProblem | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // the latest callback, so a recording that ends after a re-render reaches the current one
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // let go of the microphone when the page goes away mid-recording
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  /** Resolves false when there's no microphone to record with, or the seller said no. */
  const start = async (): Promise<boolean> => {
    setProblem(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setProblem("unsupported");
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem("denied");
      return false;
    }
    const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
      const type = rec.mimeType || mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      done.current(new File([new Blob(chunks, { type })], `voice-note.${ext}`, { type: type.split(";")[0] }));
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setRecording(true);
    const began = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= maxSeconds && rec.state === "recording") rec.stop();
    }, 250);
    return true;
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  return { recording, seconds, problem, start, stop };
}

/** 75 → "1:15" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
