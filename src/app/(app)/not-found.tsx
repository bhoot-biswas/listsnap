import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";

/**
 * A listing, job or chat that isn't in this shop (or no longer exists), inside the app,
 * so the sidebar stays and the seller can go on from there.
 */
export default async function AppNotFound() {
  const t = await getTranslations();
  return (
    <>
      <TopBar title={t("errors.notFoundTitle")} />
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="text-muted-foreground">{t("errors.notFoundBody")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/dashboard">{t("errors.goDashboard")}</ButtonLink>
          <ButtonLink href="/listings" variant="outline">
            {t("errors.goListings")}
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
