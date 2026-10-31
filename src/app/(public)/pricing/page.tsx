import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/app/button-link";
import { PublicHeader } from "../_components/public-header";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pricing"))("title") };
}

/** Static pricing. Nothing charges money during the hackathon. */
export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const tLanding = await getTranslations("landing");
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 py-6">
      <PublicHeader />
      <section className="space-y-8 py-10">
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
      </section>
    </main>
  );
}
