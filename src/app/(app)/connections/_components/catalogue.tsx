import { getTranslations } from "next-intl/server";
import { ServiceLogo } from "@/components/app/logos/service-logo";
import { ButtonLink } from "@/components/app/button-link";
import { DemoStoreButton } from "@/components/app/demo-store-button";
import { ShopifyDemoButton } from "@/components/app/shopify-demo-button";
import type { ServiceOverview } from "@/server/connections/overview";
import { woo, shopify } from "@/server/providers";
import { env } from "@/server/env";
import type { ServiceGroup } from "@/lib/connectors";

const GROUPS: ServiceGroup[] = ["store", "social"];

/** The services a shop can still connect, as cards, then our demo stores for a shop without one. */
export async function Catalogue({ services }: { services: ServiceOverview[] }) {
  const t = await getTranslations("connections");
  const open = services.filter((s) => s.status === "none");
  const wooDemo = open.some((s) => s.service === "woo") && (woo().mode === "mock" || !!env().demoWoo);
  const shopifyDemo = open.some((s) => s.service === "shopify") && (shopify().mode === "mock" || !!env().demoShopify);

  if (!open.length) return <p className="text-muted-foreground">{t("allConnected")}</p>;

  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const cards = open.filter((s) => s.group === group);
        if (!cards.length) return null;
        return (
          <section key={group} aria-labelledby={`add-${group}`} className="space-y-2">
            <h2 id={`add-${group}`} className="text-sm font-semibold text-muted-foreground">
              {t(`groups.${group}`)}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {cards.map((s) => (
                <li key={s.service} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <ServiceLogo service={s.service} />
                    <h3 className="font-medium">{t(`names.${s.service}`)}</h3>
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">{t(`desc.${s.service}`)}</p>
                  <ButtonLink
                    href={`/connections/add/${s.service}`}
                    variant="outline"
                    className="h-11 self-start md:h-9"
                    aria-label={t("connectService", { name: t(`names.${s.service}`) })}
                  >
                    {t("connect")}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {(wooDemo || shopifyDemo) && (
        <section aria-labelledby="add-demo" className="space-y-1 rounded-xl border border-dashed p-4">
          <h2 id="add-demo" className="text-sm font-semibold">
            {t("demoTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("demoBody")}</p>
          {wooDemo && <DemoStoreButton next="connections" label={t("demoWoo")} />}
          {shopifyDemo && <ShopifyDemoButton next="connections" label={t("demoShopify")} />}
        </section>
      )}
    </div>
  );
}
