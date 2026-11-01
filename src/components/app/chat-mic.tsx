"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clock, useRecorder } from "@/hooks/use-recorder";

/**
 * Talk instead of typing: tap, speak, tap again. Muse Voice Transcribe writes it down and
 * the words land in the message box, where the seller can fix a misheard word before
 * sending; nothing goes to the chat by itself.
 */
export function ChatMic({
  disabled,
  onText,
  onWorking,
}: {
  disabled?: boolean;
  onText: (text: string) => void;
  /** True from the first word until the text is in the box, so send waits for it. */
  onWorking: (working: boolean) => void;
}) {
  const t = useTranslations("chat.voice");
  const tRec = useTranslations("recorder");
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mic = useRecorder(async (file) => {
    setWriting(true);
    try {
      const form = new FormData();
      form.append("audio", file, file.name);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) return setError(body?.error?.message ?? t("failed"));
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!text) return setError(t("notHeard"));
      onText(text);
    } catch {
      setError(t("failed"));
    } finally {
      setWriting(false);
      onWorking(false);
    }
  });

  const status = mic.recording
    ? t("listening", { time: clock(mic.seconds) })
    : writing
      ? t("writing")
      : (error ?? (mic.problem ? tRec(mic.problem) : null));

  return (
    <>
      {mic.recording ? (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="size-11 shrink-0 rounded-full md:size-9"
          onClick={mic.stop}
        >
          <Square className="size-4" aria-hidden="true" />
          <span className="sr-only">{t("stopSpeaking")}</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 md:size-9"
          disabled={disabled || writing}
          onClick={() => {
            setError(null);
            onWorking(true);
            // no microphone, or the seller said no: nothing is coming
            void mic.start().then((started) => started || onWorking(false));
          }}
        >
          {writing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Mic className="size-4" aria-hidden="true" />
          )}
          <span className="sr-only">{t("speak")}</span>
        </Button>
      )}
      <p
        aria-live="polite"
        className={
          error || mic.problem
            ? "min-w-0 flex-1 truncate text-xs text-destructive"
            : "min-w-0 flex-1 truncate text-xs text-muted-foreground"
        }
      >
        {status}
      </p>
    </>
  );
}
