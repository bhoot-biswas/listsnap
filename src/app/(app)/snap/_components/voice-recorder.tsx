"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clock } from "@/hooks/use-recorder";
import { useLiveDictation } from "@/hooks/use-live-dictation";
import { cn } from "@/lib/utils";
import { VOICE_NOTE_MAX_S } from "@/lib/schemas/voice-note";

/**
 * An optional voice note with the photo: tap to record, tap to stop (or it stops at the
 * limit), play it back, delete it. The seller says what a photo can't show, like the
 * price, sizes, stock and fabric. Hands the recording to the form as a File.
 *
 * The words show up under it while the seller talks, so they know they were heard. That
 * is only a preview: the listing is made from the recording, written down again after
 * upload, so a hiccup in the live words never changes it.
 */
export function VoiceRecorder({
  disabled,
  onChange,
  onRecording,
}: {
  disabled?: boolean;
  onChange: (note: File | null) => void;
  /** The note only exists once recording stops, so the form must not upload before then. */
  onRecording?: (recording: boolean) => void;
}) {
  const t = useTranslations("snap.voice");
  const tRec = useTranslations("recorder");
  const [url, setUrl] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  // a deleted note's last words can still be on their way; they mustn't come back
  const dropped = useRef(false);
  const mic = useLiveDictation({
    writeDown: false,
    onWords: (text) => !dropped.current && setHeard(text || null),
    onRecorded: (file) => {
      onChange(file);
      setUrl(URL.createObjectURL(file));
    },
    onDone: (text) => {
      if (dropped.current) return;
      setHeard(text || null);
      setSettled(true);
    },
    // the recording is still there for the listing; only the preview is lost
    onFail: () => setHeard(null),
  });
  const recording = mic.phase === "listening";

  useEffect(() => onRecording?.(recording), [recording, onRecording]);

  // let go of the playback URL when it's replaced or the form goes away
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const remove = () => {
    dropped.current = true;
    onChange(null);
    setUrl(null);
    setHeard(null);
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-3">
        {recording ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            onClick={() => void mic.stop()}
          >
            <Square className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("stop")}</span>
          </Button>
        ) : !url ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            onClick={() => {
              dropped.current = false;
              setHeard(null);
              setSettled(false);
              void mic.start();
            }}
            disabled={disabled}
          >
            <Mic className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("record")}</span>
          </Button>
        ) : null}
        {url && !recording ? (
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
              {recording ? t("recording", { time: clock(mic.seconds), max: clock(VOICE_NOTE_MAX_S) }) : t("title")}
            </p>
            {!recording && <p className="text-xs text-muted-foreground">{t("hint")}</p>}
          </div>
        )}
      </div>
      {heard && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("heard")}</p>
          <p
            lang="bn"
            className={cn(
              "rounded-md bg-muted px-3 py-2 text-sm leading-relaxed",
              // still being heard: it can change until the seller stops
              !settled && "text-muted-foreground",
            )}
          >
            {heard}
          </p>
        </div>
      )}
      {mic.problem && (
        <p role="alert" className="text-sm text-destructive">
          {tRec(mic.problem)}
        </p>
      )}
    </div>
  );
}
