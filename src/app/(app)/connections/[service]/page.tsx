import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { connectionsOverview } from "@/server/connections/overview";
import { forWorkspace } from "@/server/db/scope";
import { metaConnection } from "@/server/social/connection";
import { Service } from "@/lib/connectors";
import { cn } from "@/lib/utils";
import { WooDetail } from "../_components/woo-detail";
import { ShopifyDetail } from "../_components/shopify-detail";
import { MetaDetail } from "../_components/meta-detail";

export async function generateMetadata({ params }: PageProps<"/connections/[service]">): Promise<Metadata> {
  const service = Service.safeParse((await params).service);
  const t = await getTranslations("connections");
  return { title: service.success ? t(`names.${service.data}`) : (await getTranslations("nav"))("connections") };
}

// what /api/shopify/callback reports back with ?shopify=
const NOTICES = ["connected", "shop", "demo", "denied", "expired", "scopes", "taken", "failed"] as const;

/** One service's page: its status, settings and Disconnect, or how to connect it. */
export default async function ServicePage({ params, searchParams }: PageProps<"/connections/[service]">) {
  const parsed = Service.safeParse((await params).service);
  if (!parsed.success) notFound();
  const service = parsed.data;
  const viewer = await requireWorkspace();
  const t = await getTranslations("connections");
  const tShopify = await getTranslations("connections.shopifyCard");
  const { services, severalStores } = await connectionsOverview(viewer.workspace);
  const s = services.find((x) => x.service === service);
  // demo shops only have our WooCommerce test store
  if (!s) redirect("/connections");

  const ws = forWorkspace(viewer.workspace.id);
  const raw = (await searchParams).shopify;
  const notice = service === "shopify" ? NOTICES.find((n) => n === raw) : undefined;

  return (
    <>
      <TopBar title={t(`names.${service}`)} />
      {/* room at the bottom so the camera button never covers Disconnect */}
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-4 pb-24 md:px-6 md:pb-6">
        {notice && (
          <p
            role="status"
            className={cn(
              "rounded-xl border p-4 text-sm",
              notice === "connected" ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
            )}
          >
            {notice === "connected" ? tShopify("connected") : tShopify(`errors.${notice}`)}
          </p>
        )}
        {service === "meta" ? (
          <MetaDetail s={s} meta={(await metaConnection(ws))?.settings ?? null} />
        ) : service === "woo" ? (
          <WooDetail
            s={s}
            row={viewer.workspace.isDemo ? null : await ws.storeConnection("woo")}
            severalStores={severalStores}
          />
        ) : (
          <ShopifyDetail s={s} row={await ws.storeConnection("shopify")} severalStores={severalStores} />
        )}
      </div>
    </>
  );
}
