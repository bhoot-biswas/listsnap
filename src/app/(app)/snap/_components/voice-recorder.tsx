"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clock, useRecorder } from "@/hooks/use-recorder";
import { VOICE_NOTE_MAX_S } from "@/lib/schemas/voice-note";

/**
 * An optional voice note with the photo: tap to record, tap to stop (or it stops at the
 * limit), play it back, delete it. The seller says what a photo can't show, like the
 * price, sizes, stock and fabric. Hands the recording to the form as a File.
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
  const mic = useRecorder((file) => {
    onChange(file);
    setUrl(URL.createObjectURL(file));
  });

  useEffect(() => onRecording?.(mic.recording), [mic.recording, onRecording]);

  // let go of the playback URL when it's replaced or the form goes away
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const remove = () => {
    onChange(null);
    setUrl(null);
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-3">
        {mic.recording ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            onClick={mic.stop}
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
            onClick={() => void mic.start()}
            disabled={disabled}
          >
            <Mic className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("record")}</span>
          </Button>
        ) : null}
        {url && !mic.recording ? (
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
              {mic.recording ? t("recording", { time: clock(mic.seconds), max: clock(VOICE_NOTE_MAX_S) }) : t("title")}
            </p>
            {!mic.recording && <p className="text-xs text-muted-foreground">{t("hint")}</p>}
          </div>
        )}
      </div>
      {mic.problem && (
        <p role="alert" className="text-sm text-destructive">
          {tRec(mic.problem)}
        </p>
      )}
    </div>
  );
}
