import { getFormatter, getTranslations } from "next-intl/server";
import { WooChecks } from "@/components/app/woo-checks";
import { WooConnectForm } from "@/components/app/woo-connect-form";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { keyHint } from "@/server/stores/woo-store";
import { disconnectWoo, recheckWoo } from "@/server/actions/woo-connection";
import type { ConnectionRow } from "@/server/db/connections";
import type { ServiceOverview } from "@/server/connections/overview";
import { WooSettings, type WooCheck } from "@/lib/woo-connection";
import { relativeTime } from "@/lib/relative-time";
import { DetailHeader, DetailSection } from "./detail-header";
import type { StoreActivity } from "@/server/connections/activity";
import { ActivitySection } from "./activity-section";
import { AutoSaveSelect, SaveDraftsSwitch } from "./auto-save";

/** WooCommerce's page: its checks, settings and keys. */
export async function WooDetail({
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
  const format = await getFormatter();
  const settings = WooSettings.parse(row?.settings_json ?? {});
  const checks = (Array.isArray(row?.checks_json) ? row.checks_json : []) as WooCheck[];
  const own = !!row && (s.status === "connected" || s.status === "broken");
  const hint = keyHint(row?.credentials_enc ?? null);

  const testNow = own && (
    <form action={recheckWoo}>
      <PendingButton variant={s.status === "broken" ? "default" : "outline"} size="lg">
        {t("testNow")}
      </PendingButton>
    </form>
  );

  return (
    <div className="space-y-6">
      <DetailHeader s={s} action={testNow} />

      {!own ? (
        <>
          <DetailSection id="woo-status" title={t("statusTitle")}>
            {/* a demo shop has no store of its own to connect */}
            <p className="text-sm text-muted-foreground">{row ? t("usingDemoBody") : t("demoShopBody")}</p>
            {row && severalStores && <SaveDraftsSwitch kind="woo" on={settings.saveDrafts} />}
            {row && (
              <details className="rounded-lg border px-3 py-2">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium md:min-h-10">
                  {t("connectOwn")}
                </summary>
                <div className="pt-3">
                  <WooConnectForm next="connections" />
                </div>
              </details>
            )}
          </DetailSection>
          <ActivitySection id="woo-activity" activity={activity} />
        </>
      ) : (
        <>
          <DetailSection id="woo-status" title={t("statusTitle")}>
            {s.checkedAt && (
              <p className="text-sm text-muted-foreground">
                {t("checked", { time: relativeTime(format, s.checkedAt) })}
              </p>
            )}
            {checks.length > 0 && <WooChecks checks={checks} />}
            <details className="rounded-lg border px-3 py-2" open={s.status === "broken"}>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium md:min-h-10">
                {t("replaceKeys")}
                {hint && <span className="ml-2 font-normal text-muted-foreground">{t("keyHint", { hint })}</span>}
              </summary>
              <div className="pt-3">
                <WooConnectForm next="connections" />
              </div>
            </details>
          </DetailSection>

          <DetailSection id="woo-settings" title={t("settingsTitle")}>
            {settings.categories.length ? (
              <AutoSaveSelect
                id="woo-category"
                label={t("defaultCategoryLabel")}
                kind="woo"
                field="category"
                value={settings.defaultCategoryId ? String(settings.defaultCategoryId) : ""}
                noneLabel={t("noDefaultCategory")}
                options={settings.categories.map((c) => ({ value: String(c.id), label: c.name }))}
              />
            ) : (
              // connected before categories were kept: the next check reads them
              <div className="space-y-1">
                <p className="text-sm">
                  {settings.defaultCategoryName
                    ? t("defaultCategory", { name: settings.defaultCategoryName })
                    : t("noDefaultCategory")}
                </p>
                <p className="text-xs text-muted-foreground">{t("categoriesHint")}</p>
              </div>
            )}
            {severalStores && <SaveDraftsSwitch kind="woo" on={settings.saveDrafts} />}
          </DetailSection>

          <ActivitySection id="woo-activity" activity={activity} />

          <form action={disconnectWoo} className="space-y-1">
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
      )}
    </div>
  );
}
