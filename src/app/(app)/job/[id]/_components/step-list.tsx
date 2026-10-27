"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Circle, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobState, StepView } from "@/lib/job-state";
import { cn } from "@/lib/utils";

type Row = {
  key: string;
  label: string;
  status: StepView["status"];
  detail?: string | null;
  step?: StepView;
  active?: boolean;
};

/**
 * The honest progress list: each real step as it happens, with one line
 * of what the AI decided. Listing steps are summed across listings so a three-item job
 * reads as three lines, not nine.
 */
export function StepList({ state, onRetry }: { state: JobState; onRetry: (s: StepView) => Promise<void> }) {
  const t = useTranslations("job");
  const find = (step: string, target = "-") => state.steps.find((s) => s.step === step && s.target === target);
  const nextKeys = new Set(state.next.map((n) => n.key.split(":")[0]));

  const rows: Row[] = [{ key: "upload", label: t("steps.upload"), status: "done" }];
  for (const step of ["plan", "segment", "group"] as const) {
    const s = find(step);
    if (step === "group" && state.items.length <= 1 && s?.status === "done") continue;
    rows.push({
      key: step,
      label: t(`steps.${step}`),
      status: s?.status ?? "pending",
      detail: s?.detail,
      step: s,
      active: nextKeys.has(step),
    });
  }

  if (state.listings.length) {
    const sum = (step: string, targets: string[]) => {
      const views = targets.map((tg) => find(step, tg));
      const failed = views.find((v) => v?.status === "failed");
      const done = views.filter((v) => v?.status === "done").length;
      const status: StepView["status"] = failed
        ? "failed"
        : done === targets.length
          ? "done"
          : views.some((v) => v?.status === "running")
            ? "running"
            : "pending";
      return { status, failed, done, total: targets.length, detail: views.length === 1 ? views[0]?.detail : null };
    };
    const ids = state.listings.map((l) => l.id);
    const write = sum("write", ids);
    rows.push({
      key: "write",
      label: t("steps.write"),
      status: write.status,
      detail: write.detail,
      step: write.failed,
      active: nextKeys.has("write"),
    });
    if (state.translate) {
      const tr = sum("translate", ids);
      rows.push({
        key: "translate",
        label: t("steps.translate"),
        status: tr.status,
        detail: tr.detail,
        step: tr.failed,
        active: nextKeys.has("translate"),
      });
    }
    const renders = sum(
      "render",
      ids.flatMap((id) => state.scenes.map((sc) => `${id}:${sc}`)),
    );
    rows.push({
      key: "render",
      label: `${t("steps.render")} (${renders.done}/${renders.total})`,
      status: renders.status,
      step: renders.failed,
      active: nextKeys.has("render"),
    });
  }

  return (
    <ol className="space-y-3" aria-live="polite">
      {rows.map((r) => (
        <StepRow key={r.key} row={r} onRetry={onRetry} />
      ))}
    </ol>
  );
}

function StepRow({ row, onRetry }: { row: Row; onRetry: (s: StepView) => Promise<void> }) {
  const t = useTranslations();
  const [retrying, setRetrying] = useState(false);
  const working = row.status === "running" || (row.status === "pending" && row.active);
  const Icon = row.status === "done" ? Check : row.status === "failed" ? X : working ? Loader2 : Circle;

  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          row.status === "done" && "bg-primary text-primary-foreground",
          row.status === "failed" && "bg-destructive/15 text-destructive",
          working && "text-primary",
          row.status === "pending" && !working && "text-muted-foreground",
        )}
      >
        <Icon className={cn("size-4", working && "animate-spin")} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", row.status === "pending" && !working && "text-muted-foreground")}>
          {row.label}
        </p>
        {row.detail && <p className="text-sm text-muted-foreground">{row.detail}</p>}
        {row.status === "failed" && row.step && (
          <div className="mt-1 space-y-2 rounded-lg bg-destructive/5 p-3 text-sm">
            <p className="text-destructive">{row.step.error}</p>
            {row.step.exhausted ? (
              <>
                <p className="text-muted-foreground">{t("job.failedHint")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    await onRetry(row.step!);
                    setRetrying(false);
                  }}
                >
                  <RotateCcw />
                  {t("common.tryAgain")}
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                {t("job.retrying")} · {t("job.attempt", { n: row.step.attempts + 1 })}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
