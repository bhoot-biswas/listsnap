"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "./button-link";

/** Shared body for the route-group error boundaries: what happened, work is safe, what to do. */
export function ErrorState({ reset }: { reset: () => void }) {
  const t = useTranslations();
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t("errors.title")}</h1>
      <p className="text-muted-foreground">{t("errors.body")}</p>
      <div className="flex gap-2">
        <Button onClick={reset}>{t("common.tryAgain")}</Button>
        <ButtonLink variant="outline" href="/dashboard">
          {t("placeholder.goDashboard")}
        </ButtonLink>
      </div>
    </div>
  );
}
