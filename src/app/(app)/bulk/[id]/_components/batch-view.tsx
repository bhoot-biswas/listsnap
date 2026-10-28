"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { SaveToStore } from "@/components/app/save-to-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { JOBS_AT_ONCE, useBatchRunner } from "@/hooks/use-batch-runner";
import type { BatchState } from "@/lib/batch-state";
import { BatchTable, SAVABLE } from "./batch-table";

/** One bulk upload: progress, pause and resume, the rows, and saving the chosen ones to the store. */
export function BatchView({ initial, autoStart }: { initial: BatchState; autoStart: boolean }) {
  const t = useTranslations("bulk");
  const { state, running, resume, pause, reload } = useBatchRunner(initial, autoStart);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = state.rows;
  // the same rule the runner uses: the first two unfinished jobs, while it runs
  const activeJobIds = new Set(
    running
      ? rows
          .filter((r) => r.jobStatus === "processing" && r.next.length > 0)
          .slice(0, JOBS_AT_ONCE)
          .map((r) => r.jobId)
      : [],
  );
  const left = rows.filter((r) => r.jobStatus === "processing").length;
  const done = rows.length - left;
  const chosen = rows
    .map((r) => r.listing)
    .filter((l): l is NonNullable<typeof l> => !!l && selected.has(l.id) && SAVABLE.has(l.status))
    .map((l) => l.id);

  return (
    <>
      <TopBar title={t("batchTitle", { count: rows.length })} />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-48 flex-1 space-y-1.5">
            <p className="text-sm font-medium" aria-live="polite">
              {t("progress", { done, total: rows.length })}
            </p>
            <Progress value={rows.length ? (done / rows.length) * 100 : 0} />
          </div>
          {left > 0 &&
            (running ? (
              <Button variant="outline" size="lg" onClick={pause}>
                <Pause />
                {t("pause")}
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={resume}>
                <Play />
                {t("resume")}
              </Button>
            ))}
          {chosen.length > 0 && (
            <SaveToStore
              jobId={rows[0]!.jobId}
              listingIds={chosen}
              label={t("saveSelected", { count: chosen.length })}
              onDone={() => {
                setSelected(new Set());
                void reload();
              }}
            />
          )}
        </div>

        {!running && left > 0 && (
          <p role="status" className="rounded-lg border border-warning/40 bg-marigold-soft px-4 py-3 text-sm">
            {t("pausedBanner", { count: left })}
          </p>
        )}
        {left === 0 && <p className="text-sm text-muted-foreground">{t("allDone")}</p>}

        <BatchTable
          rows={rows}
          activeJobIds={activeJobIds}
          selected={selected}
          onSelect={(id, on) =>
            setSelected((cur) => {
              const next = new Set(cur);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          onSelectAll={(ids) => setSelected(new Set(ids))}
        />
      </div>
    </>
  );
}
