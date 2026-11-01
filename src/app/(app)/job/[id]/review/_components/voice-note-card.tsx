"use client";

import { useTranslations } from "next-intl";
import { Mic } from "lucide-react";
import type { SellerFacts } from "@/lib/schemas/voice-note";

export interface VoiceNoteView {
  /** The recording; null for a job from a video, where only what was said is kept. */
  url: string | null;
  transcript: string | null;
  /** Heard by Spark Open from the audio alone, after Transcribe failed: its price isn't trusted. */
  fromAudio: boolean;
  /** What the seller said about this product while filming it. */
  fromVideo: boolean;
  facts: SellerFacts | null;
  /** False when the photo became several listings: one note can't say which it meant. */
  used: boolean;
}

/**
 * The seller's voice note beside the checks: play it back, read what was heard, and see
 * which facts went into the listing, so a wrong price can be traced to the note.
 */
export function VoiceNoteCard({ note }: { note: VoiceNoteView }) {
  const t = useTranslations("review.voiceNote");
  const f = note.facts;
  const rows = f
    ? [
        f.price_bdt !== null && [t("price"), `৳${f.price_bdt.toLocaleString("en-IN")}`],
        f.stock !== null && [t("stock"), String(f.stock)],
        f.sizes.length > 0 && [t("sizes"), f.sizes.join(", ")],
        f.colors.length > 0 && [t("colors"), f.colors.join(", ")],
        f.material && [t("material"), f.material],
        ...f.notes.map((n) => [t("note"), n]),
      ].filter((r): r is [string, string] => !!r)
    : [];

  return (
    <section aria-labelledby="voice-title" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id="voice-title" className="flex items-center gap-2 text-base font-semibold">
        <Mic className="size-4 text-primary" aria-hidden="true" />
        {note.fromVideo ? t("titleVideo") : t("title")}
      </h2>
      {note.url && <audio controls preload="none" src={note.url} className="h-11 w-full" />}
      {note.transcript === null ? (
        <p className="text-sm text-muted-foreground">{t("notHeard")}</p>
      ) : note.transcript ? (
        <blockquote lang="bn" className="border-l-2 pl-3 text-sm">
          {note.transcript}
        </blockquote>
      ) : (
        <p className="text-sm text-muted-foreground">{t("silent")}</p>
      )}
      {rows.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {!note.used ? t("notUsed") : note.fromAudio ? t("usedCheckPrice") : t("used")}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {rows.map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
