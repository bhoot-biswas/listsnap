"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LayoutGrid, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveAll } from "@/lib/save-all";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends one listing's latest text and photos to the catalog; 202 means another tab is sending it. */
async function send(listingId: string): Promise<{ ok: true } | { ok: false; message: string | null }> {
  for (let i = 0; i < 40; i++) {
    // update every time: a listing already in the catalog gets its edits and fresh photo links
    const res = await fetch(`/api/listings/${listingId}/catalog${i === 0 ? "?update=1" : ""}`, {
      method: "POST",
    }).catch(() => null);
    if (!res) return { ok: false, message: null };
    if (res.status === 202) {
      await sleep(2000);
      continue;
    }
    const body = (await res.json().catch(() => null)) as { state?: string; error?: string } | null;
    if (res.ok && body?.state === "done") return { ok: true };
    return { ok: false, message: body?.error ?? null };
  }
  return { ok: false, message: null };
}

/**
 * The ticked listings to the shop's Facebook catalog, one by one with a count on the
 * button. A refused one doesn't stop the rest; those stay ticked for Try again.
 */
export function SaveToCatalog({
  listingIds,
  catalogName,
  onDone,
  onPartial,
}: {
  listingIds: string[];
  catalogName: string;
  onDone: () => void;
  onPartial: (failedIds: string[]) => void;
}) {
  const t = useTranslations("listings.catalog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);

  const run = async (ids: string[] = listingIds) => {
    setProgress({ finished: 0, total: ids.length });
    const { saved, failed } = await saveAll(ids, send, (finished) => setProgress((p) => p && { ...p, finished }));
    setProgress(null);
    router.refresh();
    if (!failed.length) {
      toast.success(t("saved", { count: saved.length, catalog: catalogName }));
      return onDone();
    }
    const reason = failed.find((f) => f.message)?.message ?? t("failed");
    const retry = { label: tCommon("tryAgain"), onClick: () => void run(failed.map((f) => f.id)) };
    if (saved.length) {
      toast.error(t("savedSome", { saved: saved.length, failed: failed.length }), {
        description: reason,
        action: retry,
      });
      onPartial(failed.map((f) => f.id));
    } else toast.error(reason, { action: retry });
  };

  return (
    <Button type="button" variant="outline" disabled={!!progress} onClick={() => void run()}>
      {progress ? <Loader2 className="animate-spin" /> : <LayoutGrid />}
      <span aria-live="polite">
        {progress
          ? t("sending", { current: Math.min(progress.finished + 1, progress.total), total: progress.total })
          : t("button", { count: listingIds.length })}
      </span>
    </Button>
  );
}
