import { getFormatter, getTranslations } from "next-intl/server";
import { ShopifyChecks } from "@/components/app/shopify-checks";
import { ShopifyConnectForm } from "@/components/app/shopify-connect-form";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { disconnectShopify, recheckShopify } from "@/server/actions/shopify-connection";
import type { ConnectionRow } from "@/server/db/connections";
import type { ServiceOverview } from "@/server/connections/overview";
import { ShopifySettings, type ShopifyCheck } from "@/lib/shopify-connection";
import { relativeTime } from "@/lib/relative-time";
import { DetailHeader, DetailSection } from "./detail-header";
import type { StoreActivity } from "@/server/connections/activity";
import { ActivitySection } from "./activity-section";
import { AutoSaveSelect, SaveDraftsSwitch } from "./auto-save";

/** Shopify's page: the store's checks and where stock is counted. */
export async function ShopifyDetail({
  s,
  row,
  severalStores,
  activity,
}: {
  s: ServiceOverview;
  row: ConnectionRow | null;
  severalStores: boolean;
  activity: StoreActivity;
}) {
  const t = await getTranslations("connections");
  const tc = await getTranslations("connections.shopifyCard");
  const format = await getFormatter();
  const settings = ShopifySettings.parse(row?.settings_json ?? {});
  const checks = (Array.isArray(row?.checks_json) ? row.checks_json : []) as ShopifyCheck[];
  const own = s.status === "connected" || s.status === "broken";

  const testNow = own && (
    <form action={recheckShopify}>
      <PendingButton variant="outline" size="lg">
        {t("testNow")}
      </PendingButton>
    </form>
  );

  return (
    <div className="space-y-6">
      <DetailHeader s={s} action={testNow} />

      {!own ? (
        <>
          <DetailSection id="shopify-status" title={t("statusTitle")}>
            <p className="text-sm text-muted-foreground">{tc("usingDemoBody")}</p>
            {severalStores && <SaveDraftsSwitch kind="shopify" on={settings.saveDrafts} />}
            <details className="rounded-lg border px-3 py-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium md:min-h-10">
                {t("connectOwn")}
              </summary>
              <div className="pt-3">
                <ShopifyConnectForm next="connections" />
              </div>
            </details>
          </DetailSection>
          <ActivitySection id="shopify-activity" activity={activity} />
        </>
      ) : (
        <>
          <DetailSection id="shopify-status" title={t("statusTitle")}>
            {/* the fix comes first: a broken store is mended by connecting again */}
            {s.status === "broken" && <ShopifyConnectForm next="connections" label={tc("reconnect")} />}
            {s.checkedAt && (
              <p className="text-sm text-muted-foreground">
                {t("checked", { time: relativeTime(format, s.checkedAt) })}
              </p>
            )}
            {checks.length > 0 && <ShopifyChecks checks={checks} />}
          </DetailSection>

          <DetailSection id="shopify-settings" title={t("settingsTitle")}>
            {settings.locations.length > 1 ? (
              <AutoSaveSelect
                id="shopify-location"
                label={tc("chooseLocation")}
                kind="shopify"
                field="location"
                value={settings.locationId ?? ""}
                options={settings.locations.map((l) => ({ value: l.id, label: l.name }))}
              />
            ) : (
              <p className="text-sm">
                {settings.locationName ? tc("location", { name: settings.locationName }) : tc("noLocation")}
              </p>
            )}
            {severalStores && <SaveDraftsSwitch kind="shopify" on={settings.saveDrafts} />}
          </DetailSection>

          <ActivitySection id="shopify-activity" activity={activity} />

          <form action={disconnectShopify} className="space-y-1">
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
    </div>
  );
}
