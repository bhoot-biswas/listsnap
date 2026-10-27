import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";
import { ButtonLink } from "@/components/app/button-link";
import { optionalViewer } from "@/server/auth/session";

/** S0 Landing, Phase 1 stub: the pitch and the way in. The full page comes in Phase 7. */
export default async function LandingPage() {
  const t = await getTranslations("landing");
  const viewer = await optionalViewer();
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="size-8" />
          <span className="font-heading text-xl font-semibold">ListSnap</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
            {t("pricing")}
          </Link>
          <LanguageSwitch />
        </div>
      </header>
      <section className="flex flex-1 flex-col justify-center gap-6 py-16">
        <h1 className="text-4xl leading-tight font-bold md:text-5xl">{t("title")}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{t("body")}</p>
        <p className="font-mono text-sm text-primary">{t("steps")}</p>
        <div>
          <ButtonLink href={viewer ? "/dashboard" : "/sign-in"} size="lg">
            {viewer ? t("openShop") : t("start")}
            <ArrowRight />
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
