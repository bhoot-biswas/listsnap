import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Camera } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { connectTestMeta, disconnectMeta } from "@/server/actions/meta-connection";
import { metaConnection } from "@/server/social/connection";
import { env } from "@/server/env";
import { cn } from "@/lib/utils";
import { WooCard } from "./_components/woo-card";
import { ShopifyCard } from "./_components/shopify-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("connections") };
}

// what /api/shopify/callback reports back with ?shopify=
const NOTICES = ["connected", "shop", "demo", "denied", "expired", "scopes", "taken", "failed"] as const;
type Notice = (typeof NOTICES)[number];

/**
 * S13 Connections: the store cards (WooCommerce and Shopify, either or both), each with
 * its checks and actions, and Facebook and Instagram for posting reels.
 */
export default async function ConnectionsPage({ searchParams }: PageProps<"/connections">) {
  const viewer = await requireWorkspace();
  const t = await getTranslations("connections");
  const tShopify = await getTranslations("connections.shopifyCard");
  const tNav = await getTranslations("nav");
  const ws = forWorkspace(viewer.workspace.id);
  const [wooRow, shopifyRow, metaRow] = await Promise.all([
    viewer.workspace.isDemo ? null : ws.storeConnection("woo"),
    viewer.workspace.isDemo ? null : ws.storeConnection("shopify"),
    metaConnection(ws),
  ]);
  const live = (r: typeof wooRow) => !!r && r.status !== "disconnected";
  const several = live(wooRow) && live(shopifyRow);
  const raw = (await searchParams).shopify;
  const notice = NOTICES.find((n) => n === raw) as Notice | undefined;
  const meta = metaRow?.settings ?? null;
  // a test Page is only offered while posting goes to the mock providers
  const testAllowed = env().providers.facebook === "mock" && env().providers.instagram === "mock";

  return (
    <>
      <TopBar title={tNav("connections")} />
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
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
          <WooCard row={wooRow} isDemo={viewer.workspace.isDemo} several={several} />
          {!viewer.workspace.isDemo && <ShopifyCard row={shopifyRow} several={several} />}
        </div>

        <section aria-labelledby="meta-title" className="h-fit space-y-4 rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Camera className={cn("size-6", meta ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
              <h2 id="meta-title" className="font-semibold">
                {t("meta.title")}
              </h2>
            </div>
            {meta && (
              <span className="inline-flex h-6 items-center rounded-full bg-success/15 px-2.5 text-xs font-medium text-success">
                {meta.test ? t("meta.test") : t("connected")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t("meta.body")}</p>
          {meta ? (
            <>
              <dl className="grid gap-1 text-sm">
                <dd>{t("meta.page", { name: meta.pageName })}</dd>
                <dd>{meta.igUsername ? t("meta.instagram", { name: meta.igUsername }) : t("meta.noInstagram")}</dd>
              </dl>
              <form action={disconnectMeta} className="space-y-1 border-t pt-3">
                <ConfirmButton
                  question={t("meta.disconnectConfirm")}
                  confirmLabel={t("disconnectYes")}
                  cancelLabel={t("keepConnected")}
                  className="h-11 text-destructive md:h-10"
                >
                  {t("meta.disconnect")}
                </ConfirmButton>
                <p className="text-xs text-muted-foreground">{t("meta.disconnectHint")}</p>
              </form>
            </>
          ) : (
            <>
              {testAllowed && (
                <form action={connectTestMeta} className="space-y-2">
                  <PendingButton variant="outline" size="lg">
                    {t("meta.connectTest")}
                  </PendingButton>
                  <p className="text-xs text-muted-foreground">{t("meta.testHint")}</p>
                </form>
              )}
              <p className="text-xs text-muted-foreground">{t("meta.realSoon")}</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
