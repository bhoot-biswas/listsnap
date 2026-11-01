import { ButtonLink } from "@/components/app/button-link";
import { getTranslations } from "next-intl/server";
import { optionalViewer } from "@/server/auth/session";

/** An address that matches no page. A visitor who isn't signed in goes home, not to a dashboard they can't open. */
export default async function NotFound() {
  const t = await getTranslations();
  const signedIn = !!(await optionalViewer());
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t("errors.notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t(signedIn ? "errors.notFoundBody" : "errors.notFoundPublic")}</p>
      {signedIn ? (
        <ButtonLink href="/dashboard">{t("errors.goDashboard")}</ButtonLink>
      ) : (
        <ButtonLink href="/">{t("errors.goHome")}</ButtonLink>
      )}
    </main>
  );
}
