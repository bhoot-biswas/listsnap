"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_BULK } from "@/lib/batch-state";
import { bulkCost } from "@/lib/bulk-cost";
import { uploadBatch } from "@/lib/bulk-upload";

/**
 * Picks up to `max` photos (20, or fewer near the daily limit), shows what they will use
 * of today's listings and AI photos, then uploads them as one batch and runs it.
 */
export function BulkUploadButton({
  max,
  listingsLeft,
  imagesLeft,
  scenesPerListing,
}: {
  max: number;
  listingsLeft: number;
  imagesLeft: number;
  scenesPerListing: number;
}) {
  const t = useTranslations("bulk");
  const tLimits = useTranslations("limits");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [picked, setPicked] = useState<File[] | null>(null);

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    if (files.length > max)
      return toast.error(max < MAX_BULK ? tLimits("left", { count: max }) : t("tooMany", { max: MAX_BULK }));
    setPicked(files);
  };

  const start = async (files: File[]) => {
    setPicked(null);
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
      <Button size="lg" onClick={() => input.current?.click()} disabled={!!progress || !!picked}>
        {progress ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        <span aria-live="polite">{progress ? t("uploading", progress) : t("newUpload")}</span>
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      {picked && (
        <CostCheck
          photos={picked.length}
          listingsLeft={listingsLeft}
          imagesLeft={imagesLeft}
          scenesPerListing={scenesPerListing}
          onGo={() => void start(picked)}
          onCancel={() => setPicked(null)}
        />
      )}
    </>
  );
}

/** What the upload will use, against what's left today; nothing starts until the seller says so. */
function CostCheck({
  photos,
  listingsLeft,
  imagesLeft,
  scenesPerListing,
  onGo,
  onCancel,
}: {
  photos: number;
  listingsLeft: number;
  imagesLeft: number;
  scenesPerListing: number;
  onGo: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("bulk.cost");
  const cost = bulkCost({ photos, scenesPerListing, imagesLeft });
  return (
    <section aria-labelledby="bulk-cost-title" className="basis-full space-y-3 rounded-xl border bg-card p-4">
      <h2 id="bulk-cost-title" className="font-semibold">
        {t("title", { count: photos })}
      </h2>
      <p className="text-sm">
        {t("uses", { listings: cost.listings, photos: cost.aiPhotos })} {t("more")}
      </p>
      <p className="text-sm text-muted-foreground">{t("left", { listings: listingsLeft, photos: imagesLeft })}</p>
      {cost.withoutPhotos > 0 && (
        <p className="flex gap-2 rounded-lg bg-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {t("short", { count: cost.withoutPhotos })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" onClick={onGo}>
          {t("go", { count: photos })}
        </Button>
        <Button variant="outline" className="h-11" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </section>
  );
}
