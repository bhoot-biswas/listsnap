"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";

/**
 * The floating Snap button on phones. Hidden on the job pages and on Settings, where the
 * page's own main button takes that spot, on the Assistant's pages, where the message box
 * sits there, and on the Snap page itself. Where it shows, it leaves room under the page
 * so it never covers the last row, link or badge.
 */
export function SnapFab() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  if (["/job/", "/assistant"].some((p) => pathname.startsWith(p)) || ["/snap", "/settings"].includes(pathname))
    return null;
  return (
    <>
      <div aria-hidden="true" className="h-[calc(5rem+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <Link
        href="/snap"
        aria-label={t("snap")}
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
      >
        <Camera className="size-6" />
      </Link>
    </>
  );
}
