import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/app/button-link";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pricing"))("title") };
}

/** Static pricing. Nothing charges money during the hackathon. */
export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const tLanding = await getTranslations("landing");
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {[
          [t("free"), t("freeBody")],
          [t("pro"), t("proBody")],
        ].map(([name, body]) => (
          <section key={name} className="rounded-xl border bg-card p-6">
            <h2 className="text-xl font-semibold">{name}</h2>
            <p className="mt-2 text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>
      <ButtonLink href="/sign-in">{tLanding("start")}</ButtonLink>
    </main>
  );
}
