"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

/** "Save as draft in store" for one listing or all of them, then the Done page. */
export function SaveToStore({
  jobId,
  listingIds,
  label,
  variant = "default",
  update = false,
  beforeSave,
  onDone,
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
  className?: string;
}) {
  const t = useTranslations("job");
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const run = async () => {
    setSaving(true);
    if (beforeSave && !(await beforeSave())) {
      setSaving(false);
      return;
    }
    for (const id of listingIds) {
      const r = await save(id, update);
      if (!r.ok) {
        toast.error(r.message ?? t("saveFailed"));
        setSaving(false);
        router.refresh();
        return;
      }
    }
    if (onDone) {
      setSaving(false);
      onDone();
    } else router.push(`/job/${jobId}/done`);
  };

  return (
    <Button size="lg" variant={variant} onClick={run} disabled={saving} className={cn("w-full sm:w-auto", className)}>
      {saving ? <Loader2 className="animate-spin" /> : <Store />}
      <span aria-live="polite">{saving ? t("saving") : label}</span>
    </Button>
  );
}
