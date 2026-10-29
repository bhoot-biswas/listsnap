import { ButtonLink } from "@/components/app/button-link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t("errors.notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("errors.notFoundBody")}</p>
      <ButtonLink href="/dashboard">{t("errors.goDashboard")}</ButtonLink>
    </main>
  );
}
