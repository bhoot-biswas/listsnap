import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Camera, Store } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { WooChecks } from "@/components/app/woo-checks";
import { WooConnectForm } from "@/components/app/woo-connect-form";
import { DemoStoreButton } from "@/components/app/demo-store-button";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { keyHint } from "@/server/stores/woo-store";
import { disconnectWoo, recheckWoo } from "@/server/actions/woo-connection";
import { WooSettings, type WooCheck } from "@/lib/woo-connection";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("connections") };
}

/** S13 Connections, basic: the WooCommerce card with its checks and actions; Instagram is coming soon. */
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
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">{t("connectOwn")}</summary>
                <div className="pt-3">
                  <WooConnectForm next="connections" />
                </div>
              </details>
            </>
          ) : connected ? (
            <>
              <dl className="grid gap-1 text-sm text-muted-foreground">
                {row.last_checked_at && <dd>{t("checked", { time: format.relativeTime(row.last_checked_at) })}</dd>}
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
                  <Button type="submit" variant={broken ? "default" : "outline"} size="lg">
                    {t("testNow")}
                  </Button>
                </form>
              </div>
              <details className="rounded-lg border px-3 py-2">
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">{t("replaceKeys")}</summary>
                <div className="pt-3">
                  <WooConnectForm next="connections" />
                </div>
              </details>
              <form action={disconnectWoo} className="space-y-1 border-t pt-4">
                <Button type="submit" variant="ghost" className="text-destructive">
                  {t("disconnect")}
                </Button>
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

        <section aria-labelledby="ig-title" className="h-fit space-y-3 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <Camera className="size-6 text-muted-foreground" aria-hidden="true" />
            <h2 id="ig-title" className="font-semibold">
              {t("instagram")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">{t("instagramSoon")}</p>
        </section>
      </div>
    </>
  );
}
