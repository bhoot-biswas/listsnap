import { getTranslations } from "next-intl/server";
import { ConfirmButton } from "@/components/app/form-buttons";
import { disconnectMeta } from "@/server/actions/meta-connection";
import type { ServiceOverview } from "@/server/connections/overview";
import type { MetaSettings } from "@/lib/schemas/social";
import { DetailHeader, DetailSection } from "./detail-header";

/** Facebook and Instagram's page: the Page and account reels post to. */
export async function MetaDetail({ s, meta }: { s: ServiceOverview; meta: MetaSettings }) {
  const t = await getTranslations("connections");
  return (
    <div className="space-y-6">
      <DetailHeader s={s} />
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
    </div>
  );
}
