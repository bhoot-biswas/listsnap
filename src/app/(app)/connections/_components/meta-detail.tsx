import { getTranslations } from "next-intl/server";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { connectTestMeta, disconnectMeta } from "@/server/actions/meta-connection";
import type { ServiceOverview } from "@/server/connections/overview";
import { env } from "@/server/env";
import type { MetaSettings } from "@/lib/schemas/social";
import { DetailHeader, DetailSection } from "./detail-header";

/** Facebook and Instagram's page: the Page and account reels post to, or a test Page to try it. */
export async function MetaDetail({ s, meta }: { s: ServiceOverview; meta: MetaSettings | null }) {
  const t = await getTranslations("connections");
  // a test Page is only offered while posting goes to the mock providers
  const testAllowed = env().providers.facebook === "mock" && env().providers.instagram === "mock";

  return (
    <div className="space-y-6">
      <DetailHeader s={s} />
      {meta ? (
        <>
          <DetailSection id="meta-status" title={t("statusTitle")}>
            <p className="text-sm text-muted-foreground">{t("meta.body")}</p>
            <dl className="grid gap-1 text-sm">
              <dd>{t("meta.page", { name: meta.pageName })}</dd>
              <dd>{meta.igUsername ? t("meta.instagram", { name: meta.igUsername }) : t("meta.noInstagram")}</dd>
            </dl>
          </DetailSection>
          <form action={disconnectMeta} className="space-y-1">
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
        <DetailSection id="meta-connect" title={t("connectTitle")}>
          <p className="text-sm text-muted-foreground">{t("meta.body")}</p>
          {testAllowed && (
            <form action={connectTestMeta} className="space-y-2">
              <PendingButton variant="outline" size="lg">
                {t("meta.connectTest")}
              </PendingButton>
              <p className="text-xs text-muted-foreground">{t("meta.testHint")}</p>
            </form>
          )}
          <p className="text-xs text-muted-foreground">{t("meta.realSoon")}</p>
        </DetailSection>
      )}
    </div>
  );
}
