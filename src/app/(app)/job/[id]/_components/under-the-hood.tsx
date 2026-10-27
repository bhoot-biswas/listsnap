"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { JobState } from "@/lib/job-state";

/**
 * The live API log: real model names, timings and cost. Docked at the
 * side from 1280 px; a collapsible section below that.
 */
export function UnderTheHood({ state }: { state: JobState }) {
  const t = useTranslations();
  const format = useFormatter();
  const anyMock = state.calls.some((c) => c.mode === "mock");

  const log = (
    <div className="space-y-2 font-mono text-xs">
      {state.calls.length === 0 && <p className="text-muted-foreground">{t("job.noCalls")}</p>}
      {state.calls.map((c) => (
        <div key={c.id} className="border-b border-border/60 pb-2 last:border-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {format.dateTime(new Date(c.at), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span className="truncate">{c.model}</span>
            <span className="ml-auto shrink-0">{(c.ms / 1000).toFixed(1)}s</span>
            <span className={c.ok ? "text-success" : "text-destructive"}>{c.ok ? "✓" : "✕"}</span>
          </div>
          <div className="text-muted-foreground">
            {c.step} → {c.summary}
          </div>
        </div>
      ))}
      <div className="flex justify-between pt-1 font-medium">
        <span>{t("job.costSoFar")}</span>
        <span>${state.costUsd.toFixed(4)}</span>
      </div>
    </div>
  );

  const title = (
    <span className="flex items-center gap-2 font-semibold">
      {t("job.underTheHood")}
      {anyMock && <Badge variant="secondary">{t("common.mock")}</Badge>}
    </span>
  );

  return (
    <>
      <aside className="sticky top-20 hidden max-h-[calc(100svh-6rem)] space-y-3 overflow-auto rounded-xl border bg-card p-4 xl:block">
        {title}
        {log}
      </aside>
      <details className="rounded-xl border bg-card p-4 xl:hidden">
        <summary className="cursor-pointer">{title}</summary>
        <div className="mt-3">{log}</div>
      </details>
    </>
  );
}
