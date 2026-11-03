import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { StatusBadge } from "@/components/app/status-badge";
import { DEMO_SAMPLES } from "@/server/demo/samples";
import { DemoButton } from "./demo-button";
import { HeroCompare } from "./hero-compare";

/** The saree the demo shop starts with: real model output, so the hero shows what ListSnap returns. */
const saree = DEMO_SAMPLES.find((s) => s.key === "saree")!;

/** The listing ListSnap wrote for the photo, in both languages, next to the photos. */
async function ListingCard() {
  const t = await getTranslations("landing.hero");
  return (
    <div className="w-full max-w-xs rounded-2xl border bg-card/95 p-4 shadow-xl shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("listing")}</span>
        <StatusBadge status="ready" />
      </div>
      <p lang="en" className="mt-3 font-heading text-base leading-snug font-semibold">
        {saree.en.title}
      </p>
      <p lang="bn" className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {saree.bn.title}
      </p>
      <p lang="en" className="mt-3 truncate text-xs text-muted-foreground">
        {saree.en.category} · {saree.en.tags.slice(0, 2).join(" · ")}
      </p>
      <div className="mt-3 flex gap-1.5 text-xs font-medium" aria-hidden="true">
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">EN</span>
        <span lang="bn" className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
          বাং
        </span>
      </div>
    </div>
  );
}

/** Section 1: the photo is the pitch. Rendered inside the page's dark band. */
export async function Hero({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("landing");
  return (
    <section aria-labelledby="hero-title" className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-10 right-[-15%] -z-10 size-[32rem] rounded-full bg-primary/20 blur-3xl"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 md:grid-cols-[1.05fr_1fr] md:px-6 md:pt-16 md:pb-28 lg:gap-16">
        <div className="space-y-6">
          <p className="text-sm font-medium text-primary">{t("hero.eyebrow")}</p>
          <h1 id="hero-title" className="text-4xl leading-[1.05] font-bold text-balance sm:text-5xl lg:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">{t("hero.body")}</p>
          <p className="text-sm text-muted-foreground">{t("hero.languages")}</p>
          <div className="flex flex-col items-start gap-4 pt-2 sm:flex-row sm:items-center">
            {signedIn ? (
              <ButtonLink href="/dashboard" size="lg" className="rounded-full px-6">
                {t("openShop")}
                <ArrowRight aria-hidden="true" />
              </ButtonLink>
            ) : (
              <>
                <DemoButton />
                <Link
                  href="/sign-in"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t("hero.signIn")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("hero.note")}</p>
        </div>
        <div className="relative mx-auto w-full max-w-md md:max-w-none">
          <HeroCompare />
          <div className="mt-4 md:absolute md:-bottom-10 md:-left-12 md:mt-0 md:w-72">
            <ListingCard />
          </div>
        </div>
      </div>
    </section>
  );
}
