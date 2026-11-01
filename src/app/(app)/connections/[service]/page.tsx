import type { Metadata } from "next";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { connectionsOverview } from "@/server/connections/overview";
import { storeActivity } from "@/server/connections/activity";
import { requestLocale } from "@/server/step-text";
import { forWorkspace } from "@/server/db/scope";
import { metaConnection } from "@/server/social/connection";
import { Service } from "@/lib/connectors";
import { WooDetail } from "../_components/woo-detail";
import { ShopifyDetail } from "../_components/shopify-detail";
import { MetaDetail } from "../_components/meta-detail";
import { ShopifyNotice } from "../_components/shopify-notice";

export async function generateMetadata({ params }: PageProps<"/connections/[service]">): Promise<Metadata> {
  const service = Service.safeParse((await params).service);
  const t = await getTranslations("connections");
  return { title: service.success ? t(`names.${service.data}`) : (await getTranslations("nav"))("connections") };
}

/** One connected service: its status, settings and Disconnect. */
export default async function ServicePage({ params, searchParams }: PageProps<"/connections/[service]">) {
  const parsed = Service.safeParse((await params).service);
  if (!parsed.success) notFound();
  const service = parsed.data;
  const viewer = await requireWorkspace();
  const t = await getTranslations("connections");
  const { services, severalStores } = await connectionsOverview(viewer.workspace);
  const s = services.find((x) => x.service === service);
  // demo shops only have our WooCommerce test store
  if (!s) redirect("/connections");
  const notice = (await searchParams).shopify;
  // not connected (any more): the page to connect it, keeping Shopify's answer
  if (s.status === "none") {
    const q = typeof notice === "string" ? `?shopify=${encodeURIComponent(notice)}` : "";
    redirect(`/connections/add/${service}${q}` as Route);
  }

  const ws = forWorkspace(viewer.workspace.id);
  const meta = service === "meta" ? (await metaConnection(ws))?.settings : null;
  const activity = service === "meta" ? null : await storeActivity(viewer.workspace, service, await requestLocale());

  return (
    <>
      <TopBar title={t(`names.${service}`)} />
      {/* room at the bottom so the camera button never covers Disconnect */}
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 md:px-6 md:pb-6">
        {service === "shopify" && <ShopifyNotice value={notice} />}
        {meta ? (
          <MetaDetail s={s} meta={meta} />
        ) : service === "woo" ? (
          <WooDetail
            s={s}
            row={viewer.workspace.isDemo ? null : await ws.storeConnection("woo")}
            severalStores={severalStores}
            activity={activity!}
          />
        ) : (
          <ShopifyDetail
            s={s}
            row={await ws.storeConnection("shopify")}
            severalStores={severalStores}
            activity={activity!}
          />
        )}
      </div>
    </>
  );
}
