"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Camera, LayoutDashboard, ListChecks, Menu, Sparkles } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * The phone's tab bar: the places a seller goes every day one tap away, Snap raised in the
 * middle, and the full menu under More. It stands back on the job pages, Settings, the
 * Assistant and Snap itself, where the page's own bar takes the bottom of the screen, and
 * leaves room under the page so it never covers the last row.
 */
export function PhoneNav({ needsReview }: { needsReview: number }) {
  const t = useTranslations("nav");
  const format = useFormatter();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  if (["/job/", "/assistant"].some((p) => pathname.startsWith(p)) || ["/snap", "/settings"].includes(pathname))
    return null;

  const here = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const tab = (href: Route, label: string, Icon: typeof Camera, badge?: number) => (
    <Link
      href={href}
      aria-current={here(href) ? "page" : undefined}
      className={cn(
        "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
        here(href) ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="max-w-full truncate px-1">{label}</span>
      {!!badge && (
        <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
          {format.number(badge)}
          <span className="sr-only"> {t("needsReview")}</span>
        </span>
      )}
    </Link>
  );

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <nav
        aria-label={t("phoneNav")}
        className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tab("/dashboard", t("home"), LayoutDashboard)}
        {tab("/listings", t("listings"), ListChecks, needsReview)}
        <Link
          href="/snap"
          className="flex min-h-14 flex-1 flex-col items-center justify-end gap-0.5 pb-1 text-[11px] font-medium text-primary"
        >
          <span className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
            <Camera className="size-6" aria-hidden="true" />
          </span>
          {t("snap")}
        </Link>
        {tab("/assistant", t("assistant"), Sparkles)}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="size-5" aria-hidden="true" />
          {t("more")}
        </button>
      </nav>
    </>
  );
}
