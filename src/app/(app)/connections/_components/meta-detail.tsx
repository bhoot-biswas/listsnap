import { getTranslations } from "next-intl/server";
import { ConfirmButton, PendingButton } from "@/components/app/form-buttons";
import { chooseMetaCatalog, chooseMetaPage, disconnectMeta } from "@/server/actions/meta-connection";
import { metaLoginOffered } from "@/server/social/meta-connect";
import type { ServiceOverview } from "@/server/connections/overview";
import type { MetaSettings } from "@/lib/schemas/social";
import { DetailHeader, DetailSection } from "./detail-header";
import { MetaLoginButton } from "./meta-login-button";

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
        {!meta.igUsername && !meta.test && <p className="text-xs text-muted-foreground">{t("meta.linkInstagram")}</p>}
      </DetailSection>

      {meta.pages.length > 1 && (
        <DetailSection id="meta-page" title={t("settingsTitle")}>
          <form action={chooseMetaPage} className="space-y-2">
            <label htmlFor="meta-page-choice" className="text-sm font-medium">
              {t("meta.choosePage")}
            </label>
            <select
              id="meta-page-choice"
              name="pageId"
              defaultValue={meta.pageId}
              className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
            >
              {meta.pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.igUsername ? `${p.name} · ${p.igUsername}` : p.name}
                </option>
              ))}
            </select>
            <PendingButton variant="outline" size="lg">
              {t("meta.usePage")}
            </PendingButton>
          </form>
        </DetailSection>
      )}

      {!meta.test && (
        <DetailSection id="meta-catalog" title={t("meta.catalogTitle")}>
          <p className="text-sm text-muted-foreground">{t("meta.catalogIntro")}</p>
          {meta.catalogs.length > 1 ? (
            <form action={chooseMetaCatalog} className="space-y-2">
              <label htmlFor="meta-catalog-choice" className="text-sm font-medium">
                {t("meta.chooseCatalog")}
              </label>
              <select
                id="meta-catalog-choice"
                name="catalogId"
                defaultValue={meta.catalogId ?? ""}
                className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
              >
                {!meta.catalogId && <option value="" disabled />}
                {meta.catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.name} · ${c.business}`}
                  </option>
                ))}
              </select>
              <PendingButton variant="outline" size="lg">
                {t("meta.useCatalog")}
              </PendingButton>
            </form>
          ) : meta.catalogs.length === 1 ? (
            <p className="text-sm">{t("meta.catalogIs", { name: meta.catalogs[0]!.name })}</p>
          ) : (
            <p className="text-sm">
              {meta.catalogAccess ? t("meta.noCatalog") : t("meta.noCatalogAccess")}{" "}
              <a
                href="https://business.facebook.com/commerce/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("meta.commerceManager")}
              </a>
            </p>
          )}
        </DetailSection>
      )}

      {!meta.test && metaLoginOffered() && (
        <div className="space-y-1">
          <MetaLoginButton label={t("meta.reconnect")} variant="outline" />
          <p className="text-xs text-muted-foreground">{t("meta.reconnectHint")}</p>
        </div>
      )}

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
