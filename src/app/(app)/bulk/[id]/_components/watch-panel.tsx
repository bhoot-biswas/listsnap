"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Film, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WatchView } from "@/lib/batch-state";

/**
 * The first stage of a batch made from a video: watching it, which takes a minute or two,
 * then how many products it found. A failure that ran out of attempts offers Try again.
 */
export function WatchPanel({
  batchId,
  watch,
  running,
  onRetried,
}: {
  batchId: string;
  watch: WatchView;
  running: boolean;
  onRetried: () => void;
}) {
  const t = useTranslations("bulk.video");
  const [retrying, setRetrying] = useState(false);
  const working = watch.status !== "done" && !watch.exhausted && running;

  return (
    <section aria-live="polite" className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        {working ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Film className="size-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {watch.status === "done" ? (
          <>
            <p className="text-sm font-medium">{t("found", { count: watch.found ?? 0 })}</p>
            {watch.limited > 0 && (
              <p className="text-sm text-muted-foreground">{t("limited", { count: watch.limited })}</p>
            )}
          </>
        ) : watch.exhausted ? (
          <>
            <p className="text-sm font-medium text-destructive">{watch.error ?? t("failed")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 min-h-11 md:min-h-8"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                await fetch(`/api/batches/${batchId}/watch?retry=1`, { method: "POST" }).catch(() => null);
                setRetrying(false);
                onRetried();
              }}
            >
              <RotateCcw />
              {t("retry")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{working ? t("watching") : t("paused")}</p>
            <p className="text-sm text-muted-foreground">{t("watchingHint")}</p>
          </>
        )}
      </div>
    </section>
  );
}
