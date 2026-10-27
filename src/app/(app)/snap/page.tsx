import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { SnapForm } from "./_components/snap-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("snap"))("title") };
}

/** S4 New listing, basic: take or upload up to 5 photos of one product. */
export default async function SnapPage() {
  await requireWorkspace();
  const t = await getTranslations("snap");
  return (
    <>
      <TopBar title={t("title")} />
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 md:px-6">
        <p className="text-muted-foreground">{t("intro")}</p>
        <SnapForm />
        <p className="text-sm text-muted-foreground">{t("tips")}</p>
      </div>
    </>
  );
}
