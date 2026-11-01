"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resizeForUpload } from "@/lib/resize-image";
import { uploadBatch } from "@/lib/bulk-upload";
import { cn } from "@/lib/utils";
import { VoiceRecorder } from "./voice-recorder";

const MAX = 5;
const isPhoto = (f: File) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name);

/** Picks photos (camera, files, drag and drop, paste), shrinks them, uploads, then opens the job. */
export function SnapForm({ samples = [] }: { samples?: { url: string; label: string }[] }) {
  const t = useTranslations("snap");
  const tLimits = useTranslations("limits");
  const router = useRouter();
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voice, setVoice] = useState<File | null>(null);
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

  const addSample = async (url: string) => {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) return toast.error(t("sampleFailed"));
    const name = url.split("/").pop() ?? "sample.jpg";
    add([new File([await res.blob()], name, { type: "image/jpeg" })]);
  };

  /** Several different products: one job each, run together as a bulk batch. */
  const uploadEach = async () => {
    setUploading(true);
    const r = await uploadBatch(
      files.map((f) => f.file),
      () => {},
    );
    if (!r.ok) {
      setUploading(false);
      if (r.status === 401) return router.push("/sign-in");
      if (r.code === "limit_reached" || r.code === "over_limit") {
        toast.error(tLimits("toast"));
        return router.refresh();
      }
      return toast.error(t("uploadFailed"));
    }
    if (r.limited) toast.error(tLimits("leftOut", { count: r.limited }));
    router.push(`/bulk/${r.batchId}?start=1`);
  };

  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const { file } of files)
        form.append("photos", await resizeForUpload(file), file.name.replace(/\.\w+$/, ".jpg"));
      if (voice) form.append("voice", voice, voice.name);
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.status === 401) return router.push("/sign-in");
      if (res.status === 429) {
        // the page swaps the form for the limit card
        toast.error(tLimits("toast"));
        setUploading(false);
        return router.refresh();
      }
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

      {samples.length > 0 && files.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("samplesTitle")}</p>
          <ul className="flex flex-wrap gap-3">
            {samples.map((s) => (
              <li key={s.url}>
                <button
                  type="button"
                  onClick={() => addSample(s.url)}
                  className="flex items-center gap-2 rounded-lg border bg-card p-1.5 pr-3 text-sm hover:bg-muted/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small static sample thumbnail */}
                  <img src={s.url} alt="" className="size-10 rounded-md object-cover" />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                  className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full bg-background/90 shadow md:size-8"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <VoiceRecorder onChange={setVoice} disabled={uploading} />
          {files.length > 1 ? (
            <fieldset className="space-y-3" disabled={uploading}>
              <legend className="mb-3 text-sm font-medium">{t("several", { count: files.length })}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={uploadEach}
                  className="min-h-16 rounded-xl border bg-card p-4 text-left hover:border-primary disabled:opacity-60"
                >
                  <span className="block font-medium">{t("eachOwn")}</span>
                  <span className="block text-sm text-muted-foreground">{t("eachOwnHint")}</span>
                </button>
                <button
                  type="button"
                  onClick={upload}
                  className="min-h-16 rounded-xl border bg-card p-4 text-left hover:border-primary disabled:opacity-60"
                >
                  <span className="block font-medium">{t("sameProduct")}</span>
                  <span className="block text-sm text-muted-foreground">{t("sameProductHint")}</span>
                </button>
              </div>
              {uploading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t("uploading")}
                </p>
              )}
            </fieldset>
          ) : (
            <Button size="lg" className="w-full" onClick={upload} disabled={uploading}>
              {uploading && <Loader2 className="animate-spin" />}
              {uploading ? t("uploading") : t("start")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
