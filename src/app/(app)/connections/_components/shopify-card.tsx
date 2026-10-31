import { getFormatter, getTranslations } from "next-intl/server";
import { ShoppingBag } from "lucide-react";
import { ShopifyChecks } from "@/components/app/shopify-checks";
import { ShopifyConnectForm } from "@/components/app/shopify-connect-form";
import { ShopifyDemoButton } from "@/components/app/shopify-demo-button";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { chooseShopifyLocation, disconnectShopify, recheckShopify } from "@/server/actions/shopify-connection";
import type { ConnectionRow } from "@/server/db/connections";
import { env } from "@/server/env";
import { ShopifySettings, type ShopifyCheck } from "@/lib/shopify-connection";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import { SaveDraftsToggle } from "./save-drafts-toggle";

/** The Shopify card: the connected store with its checks and stock location, or "Connect Shopify". */
export async function ShopifyCard({ row, several }: { row: ConnectionRow | null; several: boolean }) {
  const t = await getTranslations("connections");
  const tc = await getTranslations("connections.shopifyCard");
  const format = await getFormatter();
  const settings = ShopifySettings.parse(row?.settings_json ?? {});
  const connected = !!row && row.status !== "disconnected";
  const broken = row?.status === "broken";
  const checks = (Array.isArray(row?.checks_json) ? row.checks_json : []) as ShopifyCheck[];
  const demoOffered = env().providers.shopify === "mock" || !!env().demoShopify;

  return (
    <section
      aria-labelledby="shopify-title"
      className={cn("space-y-5 rounded-xl border bg-card p-5", broken && "border-destructive")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShoppingBag className="size-6 text-primary" aria-hidden="true" />
          <div>
            <h2 id="shopify-title" className="font-semibold">
              {t("shopify")}
            </h2>
            {connected && (
              <p className="text-sm text-muted-foreground">
                {settings.demo ? t("demoStore") : (settings.shopName ?? row.base_url?.replace(/^https?:\/\//, ""))}
              </p>
            )}
          </div>
        </div>
        {connected && (
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

      {!connected ? (
        <>
          <p className="text-sm text-muted-foreground">{tc("body")}</p>
          <ShopifyConnectForm next="connections" />
          {demoOffered && (
            <div className="border-t pt-3">
              <ShopifyDemoButton next="connections" />
            </div>
          )}
        </>
      ) : settings.demo ? (
        <>
          <p className="text-sm text-muted-foreground">{tc("usingDemoBody")}</p>
          {several && <SaveDraftsToggle kind="shopify" on={settings.saveDrafts} />}
          <details className="rounded-lg border px-3 py-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium md:min-h-10">
              {t("connectOwn")}
            </summary>
            <div className="pt-3">
              <ShopifyConnectForm next="connections" />
            </div>
          </details>
        </>
      ) : (
        <>
          <dl className="grid gap-1 text-sm text-muted-foreground">
            <dd>{row.base_url?.replace(/^https?:\/\//, "")}</dd>
            {row.last_checked_at && <dd>{t("checked", { time: relativeTime(format, row.last_checked_at) })}</dd>}
            <dd>{settings.locationName ? tc("location", { name: settings.locationName }) : tc("noLocation")}</dd>
          </dl>
          {checks.length > 0 && <ShopifyChecks checks={checks} />}
          {settings.locations.length > 1 && (
            <form action={chooseShopifyLocation} className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor="shopify-location" className="text-sm font-medium">
                  {tc("chooseLocation")}
                </label>
                <select
                  id="shopify-location"
                  name="locationId"
                  defaultValue={settings.locationId ?? ""}
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {settings.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <PendingButton variant="outline" className="h-11">
                {tc("saveLocation")}
              </PendingButton>
            </form>
          )}
          <div className="flex flex-wrap gap-3">
            <form action={recheckShopify}>
              <PendingButton variant="outline" size="lg">
                {t("testNow")}
              </PendingButton>
            </form>
          </div>
          {broken && <ShopifyConnectForm next="connections" label={tc("reconnect")} />}
          {several && <SaveDraftsToggle kind="shopify" on={settings.saveDrafts} />}
          <form action={disconnectShopify} className="space-y-1 border-t pt-4">
            <ConfirmButton
              question={tc("disconnectConfirm")}
              confirmLabel={t("disconnectYes")}
              cancelLabel={t("keepConnected")}
              className="h-11 text-destructive md:h-10"
            >
              {t("disconnect")}
            </ConfirmButton>
            <p className="text-xs text-muted-foreground">{tc("disconnectHint")}</p>
          </form>
        </>
      )}
    </section>
  );
}
