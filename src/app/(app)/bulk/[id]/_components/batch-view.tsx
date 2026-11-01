"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, Pause, Play } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { SaveToStore } from "@/components/app/save-to-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { JOBS_AT_ONCE, useBatchRunner } from "@/hooks/use-batch-runner";
import type { BatchState } from "@/lib/batch-state";
import { BatchTable, SAVABLE, isStuck } from "./batch-table";
import { WatchPanel } from "./watch-panel";

/** One bulk upload: progress, pause and resume, the rows, and saving the chosen ones to the store. */
export function BatchView({ initial, autoStart }: { initial: BatchState; autoStart: boolean }) {
  const t = useTranslations("bulk");
  const tCommon = useTranslations("common");
  const { state, running, paused, offline, stalled, resume, pause, reload } = useBatchRunner(initial, autoStart);
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
  // a video batch's rows appear only once its video is watched
  const watching = !!state.watch && state.watch.status !== "done";
  // rows waiting on the seller aren't done, and the runner can't move them on either
  const stuck = rows.filter(isStuck).length;
  const choosing = rows.filter((r) => r.jobStatus === "awaiting_choice").length;
  const working = rows.filter((r) => r.jobStatus === "processing" && !isStuck(r)).length;
  const left = working + (watching && !state.watch?.exhausted ? 1 : 0);
  const done = rows.length - working - stuck - choosing;
  const chosen = rows
    .map((r) => r.listing)
    .filter((l): l is NonNullable<typeof l> => !!l && selected.has(l.id) && SAVABLE.has(l.status))
    .map((l) => l.id);

  return (
    <>
      <TopBar
        title={state.watch ? t("video.batchTitle", { count: rows.length }) : t("batchTitle", { count: rows.length })}
      />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* nothing to count until the video is watched; its panel says what's happening */}
          <div className="min-w-48 flex-1 space-y-1.5">
            {!watching && (
              <>
                <p className="text-sm font-medium" aria-live="polite">
                  {t("progress", { done, total: rows.length })}
                </p>
                <Progress value={rows.length ? (done / rows.length) * 100 : 0} />
              </>
            )}
          </div>
          {left > 0 &&
            !offline &&
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
              // the saved ones show In store; the failed stay ticked for Try again
              onPartial={(failedIds) => {
                setSelected(new Set(failedIds));
                void reload();
              }}
            />
          )}
        </div>

        {state.watch && <WatchPanel batchId={state.id} watch={state.watch} running={running} onRetried={resume} />}

        {/* a dropped connection isn't the seller's Pause: the app's offline banner says so, and it carries on by itself */}
        {offline ? null : stalled ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm">
            <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            {t("stalled")}
            <Button variant="outline" size="sm" onClick={resume}>
              {tCommon("tryAgain")}
            </Button>
          </div>
        ) : (
          paused &&
          left > 0 &&
          !watching && (
            <p role="status" className="rounded-lg border border-warning/40 bg-marigold-soft px-4 py-3 text-sm">
              {t("pausedBanner", { count: left })}
            </p>
          )
        )}
        {left === 0 &&
          !watching &&
          (choosing || stuck ? (
            <p role="status" className="rounded-lg border border-warning/40 bg-marigold-soft px-4 py-3 text-sm">
              {[choosing > 0 && t("leftChoosing", { count: choosing }), stuck > 0 && t("leftStuck", { count: stuck })]
                .filter(Boolean)
                .join(" ")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("allDone")}</p>
          ))}

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
