"use client";

import { useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type SharePayload = { name: string; urls: string[]; text: string };

// whether the browser can share files never changes while the page is open
const noSubscribe = () => () => {};
function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array(1)], "probe.jpg", { type: "image/jpeg" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * One listing's photos shared straight to another app (the Facebook app's photo picker,
 * the gallery), on phones that can share files. Sharing must start within moments of the
 * tap, so `prepare` fetches the photos ahead, when a menu or card opens; `share` then
 * hands them over and puts the listing text on the clipboard, because Facebook's app
 * drops shared text.
 */
export function usePhotoShare(listingId: string | null, beforeExport?: () => Promise<unknown>) {
  const t = useTranslations("export");
  const canShare = useSyncExternalStore(noSubscribe, canShareFiles, () => false);
  const files = useRef<Promise<File[] | null> | null>(null);
  const text = useRef("");

  const prepare = () => {
    if (!canShare || !listingId || files.current) return;
    files.current = (async () => {
      await beforeExport?.().catch(() => undefined);
      const res = await fetch(`/api/export?format=photos&ids=${listingId}`);
      if (!res.ok) return null;
      const p = (await res.json()) as SharePayload;
      text.current = p.text;
      return Promise.all(
        p.urls.map(async (u, i) => {
          const blob = await (await fetch(u)).blob();
          const ext = blob.type === "image/png" ? "png" : "jpg";
          return new File([blob], `${p.name}-${String(i + 1).padStart(2, "0")}.${ext}`, { type: blob.type });
        }),
      );
    })().catch(() => null);
  };

  const share = async (opts?: { copyText?: boolean }) => {
    const ready = await files.current;
    files.current = null;
    if (!ready?.length) return void toast.error(t("shareFailed"));
    const copyText = opts?.copyText ?? true;
    const copied =
      copyText &&
      (await navigator.clipboard?.writeText(text.current).then(
        () => true,
        () => false,
      ));
    try {
      await navigator.share({ files: ready });
      if (copied) toast.success(t("copied"));
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error(t("shareFailed"));
    }
  };

  return { canShare, prepare, share };
}
