import { getFormatter, getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { WooChecks } from "@/components/app/woo-checks";
import { WooConnectForm } from "@/components/app/woo-connect-form";
import { DemoStoreButton } from "@/components/app/demo-store-button";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { keyHint } from "@/server/stores/woo-store";
import { disconnectWoo, recheckWoo } from "@/server/actions/woo-connection";
import type { ConnectionRow } from "@/server/db/connections";
import { WooSettings, type WooCheck } from "@/lib/woo-connection";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import { SaveDraftsToggle } from "./save-drafts-toggle";

/** The WooCommerce card: its checks and actions, or the form to connect one. */
export async function WooCard({
  row,
  isDemo,
  several,
}: {
  row: ConnectionRow | null;
  isDemo: boolean;
  /** More than one store is connected, so this one can be left out of new saves. */
  several: boolean;
}) {
  const t = await getTranslations("connections");
  const format = await getFormatter();
  const settings = WooSettings.parse(row?.settings_json ?? {});
  const connected = !!row && row.status !== "disconnected";
  const checks = (Array.isArray(row?.checks_json) ? row.checks_json : []) as WooCheck[];
  const broken = row?.status === "broken";

  return (
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
        {(isDemo || connected) && (
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

      {isDemo ? (
        <p className="text-sm text-muted-foreground">{t("demoShopBody")}</p>
      ) : connected && settings.demo ? (
        <>
          <p className="text-sm text-muted-foreground">{t("usingDemoBody")}</p>
          {several && <SaveDraftsToggle kind="woo" on={settings.saveDrafts} />}
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
          {several && <SaveDraftsToggle kind="woo" on={settings.saveDrafts} />}
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
  );
}
