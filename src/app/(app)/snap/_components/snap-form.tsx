"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resizeForUpload } from "@/lib/resize-image";
import { cn } from "@/lib/utils";

const MAX = 5;
const isPhoto = (f: File) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name);

/** Picks photos (camera, files, drag and drop, paste), shrinks them, uploads, then opens the job. */
export function SnapForm() {
  const t = useTranslations("snap");
  const router = useRouter();
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.some((f) => !isPhoto(f))) toast.error(t("notPhoto"));
    const photos = incoming.filter(isPhoto);
    setFiles((cur) => {
      if (cur.length + photos.length > MAX) toast.error(t("tooMany"));
      return [...cur, ...photos.slice(0, MAX - cur.length).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  };

  const remove = (i: number) =>
    setFiles((cur) => {
      URL.revokeObjectURL(cur[i]!.url);
      return cur.filter((_, j) => j !== i);
    });

  // paste a photo from the clipboard anywhere on the page (desktop)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files ?? []);
      if (pasted.length) add(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const { file } of files)
        form.append("photos", await resizeForUpload(file), file.name.replace(/\.\w+$/, ".jpg"));
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.status === 401) return router.push("/sign-in");
      if (!res.ok) throw new Error(body?.error?.message ?? t("uploadFailed"));
      router.push(`/job/${body.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("uploadFailed"));
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-4 rounded-xl border-2 border-dashed bg-card px-4 py-10 text-center transition-colors",
          dragging && "border-primary bg-primary-soft",
        )}
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => cameraRef.current?.click()} disabled={uploading || files.length >= MAX}>
            <Camera />
            {t("take")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => pickRef.current?.click()}
            disabled={uploading || files.length >= MAX}
          >
            <ImagePlus />
            {t("upload")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground max-md:hidden">{t("drop")}</p>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => e.target.files && add(e.target.files)}
        />
        <input
          ref={pickRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(e) => e.target.files && add(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" aria-live="polite">
              {t("selected", { count: files.length })}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => files.forEach((_, i) => remove(files.length - 1 - i))}
              disabled={uploading}
            >
              {t("clear")}
            </Button>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {files.map(({ url, file }, i) => (
              <li key={url} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset */}
                <img src={url} alt={file.name} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={uploading}
                  aria-label={`${t("clear")} ${file.name}`}
                  className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-background/90 shadow"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button size="lg" className="w-full" onClick={upload} disabled={uploading}>
            {uploading && <Loader2 className="animate-spin" />}
            {uploading ? t("uploading") : t("start")}
          </Button>
        </div>
      )}
    </div>
  );
}
