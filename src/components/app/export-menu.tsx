"use client";

import { useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Package, Settings, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EXPORT_MAX } from "@/lib/export";

const CSVS = ["facebook", "woocommerce", "shopify"] as const;

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
 * Export for the given listings: a listing kit (photos and copy-paste text) or, for
 * several, one zip of kits and CSV files; each CSV on its own; and on phones, the photos
 * shared straight to another app. Files download as plain links, so a big export
 * streams to disk instead of filling the phone's memory.
 */
export function ExportMenu({
  listingIds,
  hasWebsite,
  unchecked = false,
  beforeExport,
  label,
  size,
  className,
}: {
  listingIds: string[];
  /** Meta's catalog needs the shop's website; without it, the item leads to Settings. */
  hasWebsite: boolean;
  /** One listing still in Needs review: the menu says to look it over first. */
  unchecked?: boolean;
  /** Review's autosave, so the files have the seller's last edit. */
  beforeExport?: () => Promise<unknown>;
  /** The button's words, when "Export" alone would be unclear. */
  label?: string;
  size?: "default" | "lg";
  className?: string;
}) {
  const t = useTranslations("export");
  const router = useRouter();
  const canShare = useSyncExternalStore(noSubscribe, canShareFiles, () => false);
  const share = useRef<Promise<File[] | null> | null>(null);
  const text = useRef("");
  const one = listingIds.length === 1;
  const tooMany = listingIds.length > EXPORT_MAX;

  const url = (format: string) => `/api/export?format=${format}&ids=${listingIds.join(",")}`;

  const download = async (format: string) => {
    if (tooMany) return void toast.error(t("tooMany", { max: EXPORT_MAX }));
    await beforeExport?.().catch(() => undefined);
    const a = document.createElement("a");
    a.href = url(format);
    a.download = "";
    document.body.append(a);
    a.click();
    a.remove();
  };

  // Sharing must start within moments of the tap, so the photos are fetched as the menu opens.
  const loadShare = () => {
    if (!canShare || !one || share.current) return;
    share.current = (async () => {
      await beforeExport?.().catch(() => undefined);
      const res = await fetch(url("photos"));
      if (!res.ok) return null;
      const p = (await res.json()) as SharePayload;
      text.current = p.text;
      const files = await Promise.all(
        p.urls.map(async (u, i) => {
          const blob = await (await fetch(u)).blob();
          const ext = blob.type === "image/png" ? "png" : "jpg";
          return new File([blob], `${p.name}-${String(i + 1).padStart(2, "0")}.${ext}`, { type: blob.type });
        }),
      );
      return files;
    })().catch(() => null);
  };

  const sharePhotos = async () => {
    const files = await share.current;
    share.current = null;
    if (!files?.length) return void toast.error(t("shareFailed"));
    // Facebook's app drops shared text, so the text goes to the clipboard for pasting
    const copied = await navigator.clipboard?.writeText(text.current).then(
      () => true,
      () => false,
    );
    try {
      await navigator.share({ files });
      if (copied) toast.success(t("copied"));
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error(t("shareFailed"));
    }
  };

  const item = "min-h-11 md:min-h-8";
  return (
    <DropdownMenu onOpenChange={(open) => open && loadShare()}>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" size={size} className={cn("max-sm:px-3", className)} />}
      >
        <Download aria-hidden="true" />
        {label ?? t("button")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-72">
        {unchecked && (
          <>
            <DropdownMenuLabel className="text-warning">{t("notChecked")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {one && canShare && (
          <DropdownMenuItem className={item} onClick={() => void sharePhotos()}>
            <Share2 aria-hidden="true" />
            {t("share")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={item} onClick={() => void download("kit")}>
          <Package aria-hidden="true" />
          {one ? t("kit") : t("kits")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {CSVS.map((format) =>
          format === "facebook" && !hasWebsite ? (
            <DropdownMenuItem key={format} className={item} onClick={() => router.push("/settings#shop")}>
              <Settings aria-hidden="true" />
              {t("needsWebsite")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={format} className={item} onClick={() => void download(format)}>
              <FileSpreadsheet aria-hidden="true" />
              {t(format)}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
