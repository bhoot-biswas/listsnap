import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";

/** The public pages' top row: the logo back home, Pricing and the language switch. */
export async function PublicHeader() {
  const t = await getTranslations("landing");
  return (
    <header className="flex items-center justify-between">
      <Link href="/" className="flex min-h-11 items-center gap-2">
        <Logo className="size-8" />
        <span className="font-heading text-xl font-semibold">ListSnap</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/pricing"
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          {t("pricing")}
        </Link>
        <LanguageSwitch />
      </div>
    </header>
  );
}
