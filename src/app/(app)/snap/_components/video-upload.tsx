"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { VIDEO_MAX_MB, VIDEO_MAX_S } from "@/lib/schemas/video";

/** The browser names an iPhone video video/quicktime, and sometimes gives none at all. */
const typeOf = (f: File) =>
  f.type || (/\.mov$/i.test(f.name) ? "video/quicktime" : /\.webm$/i.test(f.name) ? "video/webm" : "video/mp4");

/**
 * Listings from a video: the seller films their rack or table while saying the price of
 * each thing, the way they sell on Facebook Live. The video uploads as it is, with its
 * progress shown since a phone video is large, then the bulk page watches it.
 */
export function VideoUpload({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("snap.video");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const upload = (file: File) => {
    if (file.size > VIDEO_MAX_MB * 1024 * 1024) return toast.error(t("tooLarge", { mb: VIDEO_MAX_MB }));
    setProgress(0);
    // XMLHttpRequest, not fetch: only it reports upload progress
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    xhr.setRequestHeader("Content-Type", typeOf(file));
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => {
      setProgress(null);
      toast.error(t("failed"));
    };
    xhr.onload = () => {
      const body = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      if (xhr.status === 401) return router.push("/sign-in");
      if (xhr.status !== 201 || !body?.batchId) {
        setProgress(null);
        return toast.error(body?.error?.message ?? t("failed"));
      }
      router.push(`/bulk/${body.batchId}?start=1`);
    };
    xhr.send(file);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("hint", { minutes: VIDEO_MAX_S / 60 })}</p>
      </div>
      {progress === null ? (
        <Button variant="outline" onClick={() => input.current?.click()} disabled={disabled} className="min-h-11">
          <Film />
          {t("choose")}
        </Button>
      ) : (
        <div className="w-full space-y-1 sm:w-48" aria-live="polite">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {progress < 100 ? t("uploading", { percent: progress }) : t("starting")}
          </p>
          <Progress value={progress} />
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mov"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}
