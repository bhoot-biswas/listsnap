"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobState } from "@/lib/job-state";
import { cn } from "@/lib/utils";

const MODES = ["separate", "set", "variants"] as const;
const LABEL = { separate: "chooseSeparate", set: "chooseSet", variants: "chooseVariants" } as const;

/** S6 Choose items: tick the items, pick how to list them. */
export function ChooseItems({
  state,
  onChoose,
}: {
  state: JobState;
  onChoose: (mode: string, ids: string[]) => Promise<boolean>;
}) {
  const t = useTranslations("job");
  const suggested = (MODES as readonly string[]).includes(state.suggestion?.mode ?? "")
    ? (state.suggestion!.mode as (typeof MODES)[number])
    : "separate";
  const [mode, setMode] = useState<(typeof MODES)[number]>(suggested);
  const [kept, setKept] = useState<Set<string>>(() => new Set(state.items.map((i) => i.id)));
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = (id: string) =>
    setKept((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">{t("chooseTitle")}</h2>
        <p className="text-sm text-muted-foreground">{state.suggestion?.reason ?? t("chooseBody")}</p>
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {state.items.map((item, i) => {
          const on = kept.has(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={item.color ?? t("itemN", { n: i + 1 })}
                onClick={() => toggle(item.id)}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-muted",
                  on ? "border-primary" : "border-transparent opacity-60",
                )}
              >
                {item.url && <Image src={item.url} alt="" fill sizes="120px" className="object-cover" unoptimized />}
                {on && (
                  <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-4" />
                  </span>
                )}
                {item.color && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-xs text-white">
                    {item.color}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <Button
            key={m}
            role="radio"
            aria-checked={mode === m}
            variant={mode === m ? "default" : "outline"}
            size="sm"
            className="h-11 md:h-8"
            onClick={() => setMode(m)}
          >
            {t(LABEL[m])}
            {m === suggested && <span className="text-xs opacity-80">· {t("suggested")}</span>}
          </Button>
        ))}
      </div>
      <Button
        size="lg"
        className="w-full sm:w-auto"
        disabled={!kept.size || sending}
        aria-busy={sending}
        onClick={async () => {
          setSending(true);
          setFailed(false);
          const ok = await onChoose(mode, [...kept]).catch(() => false);
          if (!ok) {
            setSending(false);
            setFailed(true);
          }
        }}
      >
        {sending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {sending ? t("chooseSending") : t("chooseConfirm", { count: kept.size })}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("chooseFailed")}
        </p>
      )}
    </section>
  );
}
