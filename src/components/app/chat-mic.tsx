"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clock } from "@/hooks/use-recorder";
import { useLiveDictation } from "@/hooks/use-live-dictation";

/**
 * Talk instead of typing: tap, speak, tap again. Muse Voice Transcribe writes it down as
 * the seller talks, and the words land in the message box, where they can fix a misheard
 * word before sending; nothing goes to the chat by itself.
 */
export function ChatMic({
  disabled,
  onWords,
  onWorking,
}: {
  disabled?: boolean;
  /** The words so far, replacing the last ones given; the final ones come last. */
  onWords: (text: string) => void;
  /** True from the tap until the words are settled, so send waits for them. */
  onWorking: (working: boolean) => void;
}) {
  const t = useTranslations("chat.voice");
  const tRec = useTranslations("recorder");
  const [error, setError] = useState<string | null>(null);

  const mic = useLiveDictation({
    onWords,
    onDone: (text) => {
      if (text) onWords(text);
      else setError(t("notHeard"));
      onWorking(false);
    },
    onFail: (message) => {
      setError(message ?? t("failed"));
      onWorking(false);
    },
  });

  const status =
    mic.phase === "listening"
      ? t("listening", { time: clock(mic.seconds) })
      : mic.phase === "writing"
        ? t("writing")
        : (error ?? (mic.problem ? tRec(mic.problem) : null));

  return (
    <>
      {mic.phase === "listening" ? (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="size-11 shrink-0 rounded-full md:size-9"
          onClick={() => void mic.stop()}
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
          disabled={disabled || mic.phase === "writing"}
          onClick={() => {
            setError(null);
            onWorking(true);
            // no microphone, or the seller said no: nothing is coming
            void mic.start().then((started) => started || onWorking(false));
          }}
        >
          {mic.phase === "writing" ? (
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
