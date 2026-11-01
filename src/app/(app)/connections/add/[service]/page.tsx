import type { Metadata } from "next";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { connectionsOverview } from "@/server/connections/overview";
import { Service, serviceHref } from "@/lib/connectors";
import { DetailHeader } from "../../_components/detail-header";
import { ConnectStep } from "../../_components/connect-step";
import { ShopifyNotice } from "../../_components/shopify-notice";
import { MetaNotice } from "../../_components/meta-notice";

export async function generateMetadata({ params }: PageProps<"/connections/add/[service]">): Promise<Metadata> {
  const service = Service.safeParse((await params).service);
  const t = await getTranslations("connections");
  return { title: service.success ? t("connectService", { name: t(`names.${service.data}`) }) : t("tabs.add") };
}

/** Connecting one service. Once it's connected, its own page takes over. */
export default async function ConnectServicePage({ params, searchParams }: PageProps<"/connections/add/[service]">) {
  const parsed = Service.safeParse((await params).service);
  if (!parsed.success) notFound();
  const service = parsed.data;
  const viewer = await requireWorkspace();
  const t = await getTranslations("connections");
  const { services } = await connectionsOverview(viewer.workspace);
  const s = services.find((x) => x.service === service);
  // demo shops only have our WooCommerce test store
  if (!s) redirect("/connections/add");
  const query = await searchParams;
  const notice = query.shopify;
  const metaNotice = query.meta;
  if (s.status !== "none") {
    // e.g. "Connect again" on a broken store comes back here with Shopify's answer
    const q =
      typeof notice === "string"
        ? `?shopify=${encodeURIComponent(notice)}`
        : typeof metaNotice === "string"
          ? `?meta=${encodeURIComponent(metaNotice)}`
          : "";
    redirect(`${serviceHref(service)}${q}` as Route);
  }

  return (
    <>
      <TopBar title={t("connectService", { name: t(`names.${service}`) })} />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 md:px-6 md:pb-6">
        {service === "shopify" && <ShopifyNotice value={notice} />}
        {service === "meta" && <MetaNotice value={metaNotice} />}
        <DetailHeader s={s} back="add" />
        <ConnectStep service={service} />
      </div>
    </>
  );
}
