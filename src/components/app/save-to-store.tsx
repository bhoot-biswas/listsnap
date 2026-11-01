"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveAll } from "@/lib/save-all";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Saves one listing; 202 means another tab is saving it, so wait for that instead of saving twice. */
async function save(listingId: string, update: boolean): Promise<{ ok: true } | { ok: false; message: string | null }> {
  for (let i = 0; i < 40; i++) {
    // only the first request reopens the saved product; later ones wait for that same save
    const url = `/api/listings/${listingId}/store${update && i === 0 ? "?update=1" : ""}`;
    const res = await fetch(url, { method: "POST" }).catch(() => null);
    if (!res) return { ok: false, message: null };
    if (res.status === 202) {
      await sleep(1500);
      continue;
    }
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, message: body?.error?.message ?? body?.error ?? null };
  }
  return { ok: false, message: null };
}

/**
 * "Save as draft in store" for one listing or all of them, then the Done page. Several are
 * saved one by one with a count on the button; a failure doesn't stop the rest, and the
 * seller is told how many made it, with a Try again for the ones that didn't.
 */
export function SaveToStore({
  jobId,
  listingIds,
  label,
  variant = "default",
  update = false,
  beforeSave,
  onDone,
  onPartial,
  className,
}: {
  jobId: string;
  listingIds: string[];
  label: string;
  variant?: "default" | "outline";
  /** Send edits to products already in the store. */
  update?: boolean;
  /** Runs first (Review flushes its autosave); false stops the save. */
  beforeSave?: () => Promise<boolean>;
  /** Stay on the page instead of opening Done (bulk saves span several jobs). */
  onDone?: () => void;
  /** Some were saved and some weren't; the page can leave just the failed ones to try again. */
  onPartial?: (failedIds: string[]) => void;
  className?: string;
}) {
  const t = useTranslations("job");
  const router = useRouter();
  const tCommon = useTranslations("common");
  const [saving, setSaving] = useState(false);
  // how many of a multi-listing save are finished, for the button's count
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);

  const run = async (ids: string[] = listingIds) => {
    setSaving(true);
    if (beforeSave && !(await beforeSave())) {
      // the store would get an older copy than what's on screen, so say why nothing happened
      toast.error(navigator.onLine === false ? t("editsOffline") : t("editsNotSaved"));
      setSaving(false);
      return;
    }
    setProgress(ids.length > 1 ? { finished: 0, total: ids.length } : null);
    const { saved, failed } = await saveAll(
      ids,
      (id) => save(id, update),
      (finished) => setProgress((p) => p && { ...p, finished }),
    );
    setProgress(null);
    if (failed.length) {
      const reason = failed.find((f) => f.message)?.message ?? t("saveFailed");
      const retry = { label: tCommon("tryAgain"), onClick: () => void run(failed.map((f) => f.id)) };
      if (saved.length) {
        toast.error(t("savedSome", { saved: saved.length, failed: failed.length }), {
          description: reason,
          action: retry,
        });
        onPartial?.(failed.map((f) => f.id));
      } else toast.error(reason, { action: retry });
      setSaving(false);
      router.refresh();
      return;
    }
    if (onDone) {
      setSaving(false);
      onDone();
    } else router.push(`/job/${jobId}/done`);
  };

  return (
    <Button
      size="lg"
      variant={variant}
      onClick={() => void run()}
      disabled={saving}
      className={cn("w-full sm:w-auto", className)}
    >
      {saving ? <Loader2 className="animate-spin" /> : <Store />}
      <span aria-live="polite">
        {!saving
          ? label
          : progress
            ? t("savingCount", { current: Math.min(progress.finished + 1, progress.total), total: progress.total })
            : t("saving")}
      </span>
    </Button>
  );
}
