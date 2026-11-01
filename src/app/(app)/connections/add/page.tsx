import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { connectionsOverview } from "@/server/connections/overview";
import { ConnectionsTabs } from "../_components/connections-tabs";
import { Catalogue } from "../_components/catalogue";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("connections.tabs"))("add") };
}

/** Connections → Add: what the shop can still connect. */
export default async function AddConnectionPage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("connections");
  const tNav = await getTranslations("nav");
  const { services } = await connectionsOverview(viewer.workspace);
  return (
    <>
      <TopBar title={tNav("connections")} />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 md:px-6 md:pb-6">
        <ConnectionsTabs current="add" />
        {services.some((s) => s.status === "none") && <p className="text-muted-foreground">{t("addIntro")}</p>}
        <Catalogue services={services} />
      </div>
    </>
  );
}
