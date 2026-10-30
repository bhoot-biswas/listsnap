"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clapperboard, Download, Loader2 } from "lucide-react";
import type { ReelLang } from "@/lib/schemas/reels";
import { cn } from "@/lib/utils";
import { ReelPost, type SocialState } from "./reel-post";

export interface ReelsState {
  made: Partial<Record<ReelLang, { url: string; aiScene: boolean } | null>>;
  langs: ReelLang[];
  left: number;
  social: SocialState;
}

type MakeState = { kind: "idle" } | { kind: "making" } | { kind: "failed"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The listing's reel on Review, one per language. It renders on the server under the
 * step rules, so another tab asking for the same reel waits for this one. The seller's
 * latest edits are saved first, because the reel shows the saved title and price.
 */
export function ReelPanel({
  listingId,
  reels,
  priceSet,
  beforeMake,
}: {
  listingId: string;
  reels: ReelsState;
  priceSet: boolean;
  beforeMake: () => Promise<boolean>;
}) {
  const t = useTranslations("review.reels");
  const router = useRouter();
  const [state, setState] = useState<Partial<Record<ReelLang, MakeState>>>({});
  const busy = Object.values(state).some((s) => s?.kind === "making");
  const making = reels.langs.find((l) => state[l]?.kind === "making");

  async function make(lang: ReelLang) {
    setState((s) => ({ ...s, [lang]: { kind: "making" } }));
    await beforeMake();
    // a reel that exists is only made again on purpose, after the seller changed something
    const retry = !!reels.made[lang] || state[lang]?.kind === "failed";
    for (let i = 0; i < 80; i++) {
      const res = await fetch(`/api/listings/${listingId}/reel/${lang}${retry && i === 0 ? "?retry=1" : ""}`, {
        method: "POST",
      }).catch(() => null);
      if (res?.status === 202) {
        await sleep(4000);
        continue;
      }
      const body = (await res?.json().catch(() => null)) as { state?: string; error?: string } | null;
      if (res?.ok && body?.state === "done") {
        setState((s) => ({ ...s, [lang]: { kind: "idle" } }));
        router.refresh();
        return;
      }
      setState((s) => ({ ...s, [lang]: { kind: "failed", message: body?.error ?? t("failed") } }));
      return;
    }
    setState((s) => ({ ...s, [lang]: { kind: "failed", message: t("failed") } }));
  }

  return (
    <section aria-labelledby="reel-title" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 id="reel-title" className="flex items-center gap-2 text-sm font-semibold">
          <Clapperboard className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("intro")}</p>
      </div>

      {reels.langs.map((lang) => {
        const reel = reels.made[lang];
        const s = state[lang] ?? { kind: "idle" };
        const name = t(`lang.${lang}`);
        return (
          <div key={lang} className="space-y-2">
            {reel && (
              <div className="flex items-end gap-3">
                <video
                  key={reel.url}
                  src={reel.url}
                  controls
                  playsInline
                  muted
                  preload="metadata"
                  aria-label={name}
                  className="aspect-[9/16] w-32 rounded-lg border bg-muted object-cover"
                />
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground" lang={lang}>
                    {name}
                  </p>
                  {reel.aiScene && <p>{t("aiScene")}</p>}
                  <a
                    href={reel.url}
                    download={`reel-${lang}.mp4`}
                    className="flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t("download")}
                  </a>
                </div>
              </div>
            )}
            <button
              type="button"
              // one render at a time: each takes about a minute of the server's CPU
              disabled={busy || !priceSet || reels.left <= 0}
              onClick={() => void make(lang)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                "hover:bg-muted/60 disabled:opacity-60",
              )}
            >
              <span>{reel ? t("again", { lang: name }) : t("make", { lang: name })}</span>
              {s.kind === "making" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            </button>
            {s.kind === "failed" && <p className="text-xs text-destructive">{s.message}</p>}
            {reel && <ReelPost listingId={listingId} lang={lang} social={reels.social} />}
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground">
        {!priceSet ? t("noPrice") : reels.left > 0 ? t("left", { n: reels.left }) : t("noneLeft")}
      </p>
      <p aria-live="polite" className="sr-only">
        {making ? t("making", { lang: t(`lang.${making}`) }) : ""}
      </p>
    </section>
  );
}
