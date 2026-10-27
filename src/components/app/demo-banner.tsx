import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Slim banner above everything in a demo shop. */
export async function DemoBanner() {
  const t = await getTranslations("demo");
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-marigold-soft px-4 py-2 text-center text-sm text-foreground">
      <span>{t("banner")}</span>
      <Link href="/sign-in" className="font-medium text-primary underline underline-offset-4">
        {t("cta")}
      </Link>
    </div>
  );
}
