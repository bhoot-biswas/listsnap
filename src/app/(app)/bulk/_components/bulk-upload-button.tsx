"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_BULK } from "@/lib/batch-state";
import { uploadBatch } from "@/lib/bulk-upload";

/** Picks up to 20 photos, uploads them as one batch, then opens the batch to run it. */
export function BulkUploadButton() {
  const t = useTranslations("bulk");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const start = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    if (files.length > MAX_BULK) return toast.error(t("tooMany", { max: MAX_BULK }));
    setProgress({ done: 0, total: files.length });
    const r = await uploadBatch(files, (done) => setProgress({ done, total: files.length }));
    if (!r.ok) {
      setProgress(null);
      return r.status === 401 ? router.push("/sign-in") : toast.error(t("uploadFailed"));
    }
    if (r.failed) toast.error(t("someFailed", { count: r.failed }));
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
