"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles } from "lucide-react";
import { LOOKS, type Look } from "@/lib/schemas/looks";
import { cn } from "@/lib/utils";

type LookState = { kind: "idle" } | { kind: "making" } | { kind: "made" } | { kind: "failed"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Campaign looks on Review: one button per occasion. A look is made on the server under
 * the step rules, so pressing again (or another tab) waits for the same photo instead of
 * paying for a second one. A new photo shows up in the photo list when it's ready.
 */
export function LooksPanel({ listingId, made, imagesLeft }: { listingId: string; made: Look[]; imagesLeft: number }) {
  const t = useTranslations("review.looks");
  const router = useRouter();
  const [state, setState] = useState<Record<string, LookState>>(() =>
    Object.fromEntries(made.map((l) => [l, { kind: "made" } as LookState])),
  );

  async function make(look: Look) {
    setState((s) => ({ ...s, [look]: { kind: "making" } }));
    const retry = state[look]?.kind === "failed";
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`/api/listings/${listingId}/looks/${look}${retry && i === 0 ? "?retry=1" : ""}`, {
        method: "POST",
      }).catch(() => null);
      if (res?.status === 202) {
        // another request holds the work; ask again until it's done
        await sleep(3000);
        continue;
      }
      const body = (await res?.json().catch(() => null)) as { state?: string; error?: string } | null;
      if (res?.ok && body?.state === "done") {
        setState((s) => ({ ...s, [look]: { kind: "made" } }));
        router.refresh();
        return;
      }
      setState((s) => ({ ...s, [look]: { kind: "failed", message: body?.error ?? t("failed") } }));
      return;
    }
    setState((s) => ({ ...s, [look]: { kind: "failed", message: t("failed") } }));
  }

  const busy = Object.values(state).some((s) => s.kind === "making");
  const making = LOOKS.find((l) => state[l]?.kind === "making");

  return (
    <section aria-labelledby="looks-title" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 id="looks-title" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("intro")}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {LOOKS.map((look) => {
          const s = state[look] ?? { kind: "idle" };
          return (
            <li key={look}>
              <button
                type="button"
                // one look at a time: each is a 20–40 s render, and the daily count must stay honest
                disabled={s.kind === "made" || busy || imagesLeft <= 0}
                onClick={() => void make(look)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                  s.kind === "made" ? "border-primary bg-primary/5" : "hover:bg-muted/60 disabled:opacity-60",
                )}
              >
                <span>{t(`names.${look}`)}</span>
                {s.kind === "making" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {s.kind === "made" && <Check className="size-4 text-primary" aria-hidden="true" />}
              </button>
              {s.kind === "failed" && <p className="mt-1 text-xs text-destructive">{s.message}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{imagesLeft > 0 ? t("cost", { n: imagesLeft }) : t("noneLeft")}</p>
      <p aria-live="polite" className="sr-only">
        {making ? t("making", { look: t(`names.${making}`) }) : ""}
      </p>
    </section>
  );
}
