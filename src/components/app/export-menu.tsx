"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePhotoShare } from "./use-photo-share";
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
  const one = listingIds.length === 1;
  const photos = usePhotoShare(one ? listingIds[0]! : null, beforeExport);
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

  const item = "min-h-11 md:min-h-8";
  return (
    <DropdownMenu onOpenChange={(open) => open && photos.prepare()}>
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
        {one && photos.canShare && (
          <DropdownMenuItem className={item} onClick={() => void photos.share()}>
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
