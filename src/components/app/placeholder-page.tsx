import { getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";
import { TopBar } from "./top-bar";
import { ButtonLink } from "./button-link";

/**
 * A page that exists in the shell but is built in a later phase. It says
 * so plainly instead of pretending, and always offers a way back.
 */
export async function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  const t = await getTranslations("placeholder");
  return (
    <>
      <TopBar title={title} />
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <Construction className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">{t("body", { phase })}</p>
        <ButtonLink variant="outline" href="/dashboard">
          {t("goDashboard")}
        </ButtonLink>
      </div>
    </>
  );
}
