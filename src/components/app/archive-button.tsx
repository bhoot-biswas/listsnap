"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setArchived } from "@/server/actions/archive";

/**
 * Archives a listing or a job, or restores one. Archiving isn't asked about first: nothing
 * is deleted, and the toast that follows has Undo.
 */
export function ArchiveButton({
  kind,
  id,
  archived,
  className,
}: {
  kind: "listing" | "job";
  id: string;
  /** Shows Restore instead of Archive. */
  archived: boolean;
  className?: string;
}) {
  const t = useTranslations("archive");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async (to: boolean) => {
    setBusy(true);
    const r = await setArchived(kind, id, to).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) return void toast.error(t("failed"));
    router.refresh();
    if (to)
      toast(t(kind === "job" ? "jobDone" : "listingDone"), {
        action: { label: t("undo"), onClick: () => void run(false) },
      });
    else toast(t("restored"));
  };

  const Icon = busy ? Loader2 : archived ? ArchiveRestore : Archive;
  return (
    <Button
      type="button"
      variant={archived ? "default" : "outline"}
      disabled={busy}
      aria-busy={busy}
      onClick={() => void run(!archived)}
      className={className ?? "h-11 md:h-9"}
    >
      <Icon className={busy ? "animate-spin" : undefined} aria-hidden="true" />
      {archived ? t("restore") : t(kind === "job" ? "job" : "listing")}
    </Button>
  );
}
