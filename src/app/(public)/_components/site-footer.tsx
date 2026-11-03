import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";

const REPO = "https://github.com/bhoot-biswas/listsnap";
const link = "inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground";

/** One quiet row: no sitemap columns for a site with three pages. */
export async function SiteFooter() {
  const t = await getTranslations("landing");
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Logo className="size-6" />
          <span className="font-heading font-semibold text-foreground">ListSnap</span>
          <span aria-hidden="true">·</span>
          <span>{t("footer.hackathon")}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/pricing" className={link}>
            {t("pricing")}
          </Link>
          <a href={REPO} className={link}>
            {t("footer.github")}
          </a>
          <LanguageSwitch />
        </div>
      </div>
    </footer>
  );
}
