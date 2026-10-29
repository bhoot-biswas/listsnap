import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RecentListings } from "@/components/app/recent-listings";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { SnapForm } from "./_components/snap-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("snap"))("title") };
}

/** Sample photos offered in demo shops; the files are in public/samples/. */
const SAMPLES = ["saree", "bangles", "kurti"] as const;

/** S4 New listing, basic: take or upload up to 5 photos of one product. */
export default async function SnapPage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("snap");
  const recent = await forWorkspace(viewer.workspace.id).recentListings(5);
  const samples = viewer.workspace.isDemo
    ? SAMPLES.map((key) => ({ url: `/samples/${key}.jpg`, label: t(`samples.${key}`) }))
    : [];
  return (
    <>
      <TopBar title={t("title")} />
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <p className="text-muted-foreground">{t("intro")}</p>
          <SnapForm samples={samples} />
          <p className="text-sm text-muted-foreground">{t("tips")}</p>
        </div>
        <RecentListings rows={recent} heading={t("recent")} empty={t("recentEmpty")} />
      </div>
    </>
  );
}
