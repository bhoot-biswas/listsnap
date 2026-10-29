"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_BULK } from "@/lib/batch-state";
import { uploadBatch } from "@/lib/bulk-upload";

/** Picks up to `max` photos (20, or fewer near the daily limit), uploads them as one batch, then runs it. */
export function BulkUploadButton({ max }: { max: number }) {
  const t = useTranslations("bulk");
  const tLimits = useTranslations("limits");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const start = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    if (files.length > max)
      return toast.error(max < MAX_BULK ? tLimits("left", { count: max }) : t("tooMany", { max: MAX_BULK }));
    setProgress({ done: 0, total: files.length });
    const r = await uploadBatch(files, (done) => setProgress({ done, total: files.length }));
    if (!r.ok) {
      setProgress(null);
      if (r.status === 401) return router.push("/sign-in");
      if (r.code === "limit_reached" || r.code === "over_limit") {
        toast.error(tLimits("toast"));
        return router.refresh();
      }
      return toast.error(t("uploadFailed"));
    }
    if (r.failed) toast.error(t("someFailed", { count: r.failed }));
    if (r.limited) toast.error(tLimits("leftOut", { count: r.limited }));
    router.push(`/bulk/${r.batchId}?start=1`);
  };

  return (
    <>
      <Button size="lg" onClick={() => input.current?.click()} disabled={!!progress}>
        {progress ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        <span aria-live="polite">{progress ? t("uploading", progress) : t("newUpload")}</span>
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => void start(e.target.files)}
      />
    </>
  );
}
