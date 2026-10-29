import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { SettingsForm } from "./_components/settings-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("settings") };
}

/** S15 Settings: the shop, how listings are written, which photos are made, and the languages. */
export default async function SettingsPage() {
  const viewer = await requireWorkspace();
  const tNav = await getTranslations("nav");
  const { name, settings, isDemo } = viewer.workspace;
  return (
    <>
      <TopBar title={tNav("settings")} />
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
        <SettingsForm
          isDemo={isDemo}
          initial={{
            name,
            mainCategory: settings.mainCategory ?? "",
            brandVoice: settings.brandVoice,
            brandNote: settings.brandNote ?? "",
            scenes: settings.scenes,
            priceRounding: settings.priceRounding,
            bangla: settings.listingLanguages.includes("bn"),
          }}
        />
      </div>
    </>
  );
}
