"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Saves one listing; 202 means another tab is saving it, so wait for that instead of saving twice. */
async function save(listingId: string): Promise<{ ok: true } | { ok: false; message: string | null }> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`/api/listings/${listingId}/store`, { method: "POST" }).catch(() => null);
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
}: {
  jobId: string;
  listingIds: string[];
  label: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("job");
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const run = async () => {
    setSaving(true);
    for (const id of listingIds) {
      const r = await save(id);
      if (!r.ok) {
        toast.error(r.message ?? t("saveFailed"));
        setSaving(false);
        router.refresh();
        return;
      }
    }
    router.push(`/job/${jobId}/done`);
  };

  return (
    <Button size="lg" variant={variant} onClick={run} disabled={saving} className="w-full sm:w-auto">
      {saving ? <Loader2 className="animate-spin" /> : <Store />}
      <span aria-live="polite">{saving ? t("saving") : label}</span>
    </Button>
  );
}
