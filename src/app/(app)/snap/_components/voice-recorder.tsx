"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VOICE_NOTE_MAX_S } from "@/lib/schemas/voice-note";

/** What the browser records in: Opus where it can (Chrome, Firefox), AAC in MP4 on Safari. */
const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

/**
 * An optional voice note with the photo: tap to record, tap to stop (or it stops at the
 * limit), play it back, delete it. The seller says what a photo can't show, like the
 * price, sizes, stock and fabric. Hands the recording to the form as a File.
 */
export function VoiceRecorder({ disabled, onChange }: { disabled?: boolean; onChange: (note: File | null) => void }) {
  const t = useTranslations("snap.voice");
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // let go of the microphone and the playback URL when the form goes away
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia)
      return setError(t("unsupported"));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError(t("denied"));
    }
    const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) clearInterval(timer.current);
      const type = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      onChange(new File([blob], `voice-note.${ext}`, { type: type.split(";")[0] }));
      setUrl(URL.createObjectURL(blob));
      setState("done");
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState("recording");
    const began = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= VOICE_NOTE_MAX_S && rec.state === "recording") rec.stop();
    }, 250);
  };

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();

  const remove = () => {
    onChange(null);
    setUrl(null);
    setState("idle");
  };

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-3">
        {state === "recording" ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            onClick={stop}
          >
            <Square className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("stop")}</span>
          </Button>
        ) : state === "idle" ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            onClick={start}
            disabled={disabled}
          >
            <Mic className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("record")}</span>
          </Button>
        ) : null}
        {state === "done" && url ? (
          <>
            <audio controls src={url} className="h-11 min-w-0 flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              onClick={remove}
              disabled={disabled}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              <span className="sr-only">{t("delete")}</span>
            </Button>
          </>
        ) : (
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-sm font-medium">
              {state === "recording"
                ? t("recording", { time: clock(seconds), max: clock(VOICE_NOTE_MAX_S) })
                : t("title")}
            </p>
            {state === "idle" && <p className="text-xs text-muted-foreground">{t("hint")}</p>}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
