import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";
import { ButtonLink } from "@/components/app/button-link";
import { optionalViewer } from "@/server/auth/session";

const navLink =
  "inline-flex min-h-9 items-center rounded-full px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * The public pages' top row. Two links at most: the phone gets only the logo, the
 * language switch and the way in, since Pricing is also in the footer.
 */
export async function PublicHeader() {
  const t = await getTranslations("landing");
  const viewer = await optionalViewer();
  return (
    <header className="flex items-center justify-between gap-3 py-2">
      <Link href="/" className="flex min-h-11 items-center gap-2">
        <Logo className="size-8" />
        <span className="font-heading text-xl font-semibold">ListSnap</span>
      </Link>
      <nav aria-label={t("nav")} className="hidden items-center gap-1 rounded-full border bg-card/40 p-1 md:flex">
        <Link href="/#how" className={navLink}>
          {t("howItWorks")}
        </Link>
        <Link href="/pricing" className={navLink}>
          {t("pricing")}
        </Link>
      </nav>
      <div className="flex items-center gap-2">
        <LanguageSwitch />
        {viewer ? (
          <ButtonLink href="/dashboard" className="h-11 rounded-full md:h-9">
            {t("openShop")}
            <ArrowRight aria-hidden="true" />
          </ButtonLink>
        ) : (
          <ButtonLink href="/sign-in" variant="outline" className="h-11 rounded-full md:h-9">
            {t("signIn")}
          </ButtonLink>
        )}
      </div>
    </header>
  );
}
