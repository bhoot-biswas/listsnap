import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Slim banner above everything in a demo shop. */
export async function DemoBanner() {
  const t = await getTranslations("demo");
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-marigold-soft px-4 py-3 text-center md:py-2 text-sm text-foreground">
      <span>{t("banner")}</span>
      {/* 44 px to tap on a phone without making the banner itself taller than the padding */}
      <Link
        href="/sign-in"
        className="relative font-medium text-primary underline underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3 md:after:hidden"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
