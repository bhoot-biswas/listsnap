import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";
import { requireWorkspace } from "@/server/auth/session";
import { OnboardingForm } from "./_components/onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("onboarding"))("title") };
}

/** S2 Onboarding, Phase 1 slice: name the shop. Full-screen, no navigation. */
export default async function OnboardingPage() {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  if (viewer.workspace.onboarded) redirect("/dashboard");
  const t = await getTranslations("onboarding");
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo className="size-8" />
        <LanguageSwitch />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
      </div>
      <OnboardingForm defaultName={viewer.workspace.name === "My shop" ? "" : viewer.workspace.name} />
    </main>
  );
}
