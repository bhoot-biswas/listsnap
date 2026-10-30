"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";

/**
 * The floating Snap button on phones. Hidden on the job pages and on Settings, where the
 * page's own main button takes that spot, on the Assistant, where the message box sits
 * there, and on the Snap page itself.
 */
export function SnapFab() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  if (pathname.startsWith("/job/") || ["/snap", "/settings", "/assistant"].includes(pathname)) return null;
  return (
    <Link
      href="/snap"
      aria-label={t("snap")}
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
    >
      <Camera className="size-6" />
    </Link>
  );
}
