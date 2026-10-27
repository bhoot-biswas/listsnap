import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";
import { ButtonLink } from "@/components/app/button-link";
import { WooConnectForm } from "@/components/app/woo-connect-form";
import { DemoStoreButton } from "@/components/app/demo-store-button";
import { requireWorkspace } from "@/server/auth/session";
import { OnboardingForm } from "./_components/onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("onboarding"))("title") };
}

/** S2 Onboarding: 1) name the shop, 2) connect WooCommerce. Full-screen, no navigation. */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  if (viewer.workspace.onboarded) redirect("/dashboard");
  const store = (await searchParams).step === "store";
  const t = await getTranslations("onboarding");
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo className="size-8" />
        <LanguageSwitch />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{t("step", { n: store ? 2 : 1 })}</p>
        <h1 className="text-2xl font-semibold">{store ? t("storeTitle") : t("title")}</h1>
        <p className="text-muted-foreground">{store ? t("storeBody") : t("body")}</p>
      </div>
      {store ? (
        <div className="space-y-6">
          <WooConnectForm next="onboarding" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <ButtonLink href="/onboarding" variant="ghost">
              {t("back")}
            </ButtonLink>
            <DemoStoreButton next="onboarding" />
          </div>
        </div>
      ) : (
        <OnboardingForm defaultName={viewer.workspace.name === "My shop" ? "" : viewer.workspace.name} />
      )}
    </main>
  );
}
