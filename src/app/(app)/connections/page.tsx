import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Camera, Store } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { WooChecks } from "@/components/app/woo-checks";
import { WooConnectForm } from "@/components/app/woo-connect-form";
import { DemoStoreButton } from "@/components/app/demo-store-button";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { keyHint } from "@/server/stores/woo-store";
import { disconnectWoo, recheckWoo } from "@/server/actions/woo-connection";
import { connectTestMeta, disconnectMeta } from "@/server/actions/meta-connection";
import { metaConnection } from "@/server/social/connection";
import { env } from "@/server/env";
import { WooSettings, type WooCheck } from "@/lib/woo-connection";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("connections") };
}

/** S13 Connections: the WooCommerce card with its checks and actions, and Facebook and Instagram for posting reels. */
export default async function ConnectionsPage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("connections");
  const tNav = await getTranslations("nav");
  const format = await getFormatter();
  const row = viewer.workspace.isDemo ? null : await forWorkspace(viewer.workspace.id).storeConnection("woo");
  const settings = WooSettings.parse(row?.settings_json ?? {});
  const connected = !!row && row.status !== "disconnected";
  const checks = (Array.isArray(row?.checks_json) ? row.checks_json : []) as WooCheck[];
  const broken = row?.status === "broken";
  const meta = (await metaConnection(forWorkspace(viewer.workspace.id)))?.settings ?? null;
  // a test Page is only offered while posting goes to the mock providers
  const testAllowed = env().providers.facebook === "mock" && env().providers.instagram === "mock";

  return (
    <>
      <TopBar title={tNav("connections")} />
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-labelledby="woo-title"
          className={cn("space-y-5 rounded-xl border bg-card p-5", broken && "border-destructive")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Store className="size-6 text-primary" aria-hidden="true" />
              <div>
                <h2 id="woo-title" className="font-semibold">
                  {t("woo")}
                </h2>
                {connected && (
                  <p className="text-sm text-muted-foreground">
                    {settings.demo ? t("demoStore") : row.base_url?.replace(/^https?:\/\//, "")}
                  </p>
                )}
              </div>
            </div>
            {(viewer.workspace.isDemo || connected) && (
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
                  broken ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success",
                )}
              >
                {broken ? t("broken") : t("connected")}
              </span>
            )}
          </div>

          {viewer.workspace.isDemo ? (
            <p className="text-sm text-muted-foreground">{t("demoShopBody")}</p>
          ) : connected && settings.demo ? (
            <>
              <p className="text-sm text-muted-foreground">{t("usingDemoBody")}</p>
              <details className="rounded-lg border px-3 py-2">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium md:min-h-10">
                  {t("connectOwn")}
                </summary>
                <div className="pt-3">
                  <WooConnectForm next="connections" />
                </div>
              </details>
            </>
          ) : connected ? (
            <>
              <dl className="grid gap-1 text-sm text-muted-foreground">
                {row.last_checked_at && <dd>{t("checked", { time: relativeTime(format, row.last_checked_at) })}</dd>}
                {keyHint(row.credentials_enc) && <dd>{t("keyHint", { hint: keyHint(row.credentials_enc)! })}</dd>}
                <dd>
                  {settings.defaultCategoryName
                    ? t("defaultCategory", { name: settings.defaultCategoryName })
                    : t("noDefaultCategory")}
                </dd>
              </dl>
              {checks.length > 0 && <WooChecks checks={checks} />}
              <div className="flex flex-wrap gap-3">
                <form action={recheckWoo}>
                  <PendingButton variant={broken ? "default" : "outline"} size="lg">
                    {t("testNow")}
                  </PendingButton>
                </form>
              </div>
              <details className="rounded-lg border px-3 py-2">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium md:min-h-10">
                  {t("replaceKeys")}
                </summary>
                <div className="pt-3">
                  <WooConnectForm next="connections" />
                </div>
              </details>
              <form action={disconnectWoo} className="space-y-1 border-t pt-4">
                <ConfirmButton
                  question={t("disconnectConfirm")}
                  confirmLabel={t("disconnectYes")}
                  cancelLabel={t("keepConnected")}
                  className="h-11 text-destructive md:h-10"
                >
                  {t("disconnect")}
                </ConfirmButton>
                <p className="text-xs text-muted-foreground">{t("disconnectHint")}</p>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("notConnected")}</p>
              <WooConnectForm next="connections" />
              <div className="border-t pt-3">
                <DemoStoreButton next="connections" />
              </div>
            </>
          )}
        </section>

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
