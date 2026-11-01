import { getTranslations } from "next-intl/server";
import { WooConnectForm } from "@/components/app/woo-connect-form";
import { ShopifyConnectForm } from "@/components/app/shopify-connect-form";
import { PendingButton } from "@/components/app/form-buttons";
import { connectTestMeta } from "@/server/actions/meta-connection";
import { env } from "@/server/env";
import { metaLoginOffered } from "@/server/social/meta-connect";
import type { Service } from "@/lib/connectors";
import { DetailSection } from "./detail-header";
import { MetaLoginButton } from "./meta-login-button";

/** How each service is connected: the same forms onboarding uses. */
export async function ConnectStep({ service }: { service: Service }) {
  const t = await getTranslations("connections");
  const tc = await getTranslations("connections.shopifyCard");
  // a test Page is only offered while posting goes to the mock providers
  const testAllowed = env().providers.facebook === "mock" && env().providers.instagram === "mock";

  return (
    <DetailSection id={`${service}-connect`} title={t("connectTitle")}>
      {service === "woo" ? (
        <>
          <p className="text-sm text-muted-foreground">{t("notConnected")}</p>
          <WooConnectForm next="connections" />
        </>
      ) : service === "shopify" ? (
        <>
          <p className="text-sm text-muted-foreground">{tc("body")}</p>
          <ShopifyConnectForm next="connections" />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("meta.body")}</p>
          {metaLoginOffered() && (
            <div className="space-y-2">
              <MetaLoginButton label={t("meta.connect")} />
              <p className="text-xs text-muted-foreground">{t("meta.connectHint")}</p>
            </div>
          )}
          {testAllowed && (
            <form action={connectTestMeta} className="space-y-2">
              <PendingButton variant="outline" size="lg">
                {t("meta.connectTest")}
              </PendingButton>
              <p className="text-xs text-muted-foreground">{t("meta.testHint")}</p>
            </form>
          )}
          {!metaLoginOffered() && <p className="text-xs text-muted-foreground">{t("meta.realSoon")}</p>}
        </>
      )}
    </DetailSection>
  );
}
