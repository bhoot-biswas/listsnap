"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "./button-link";

/**
 * Shared body for the error boundaries: what happened, work is safe, what to do. Try
 * again fetches the page again, so a passing database or network blip clears; the code
 * matches the server's log line, for when a seller writes in.
 */
export function ErrorState({
  error,
  retry,
  back = { href: "/dashboard", label: "goDashboard" },
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /** The way out besides Try again; null where there is nowhere better to go. */
  back?: { href: Route; label: "goDashboard" | "goHome" } | null;
}) {
  const t = useTranslations();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t("errors.title")}</h1>
      <p className="text-muted-foreground">
        {t(!back ? "errors.bodyRetry" : back.label === "goHome" ? "errors.bodyHome" : "errors.body")}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>{t("common.tryAgain")}</Button>
        {back && (
          <ButtonLink variant="outline" href={back.href}>
            {t(`errors.${back.label}`)}
          </ButtonLink>
        )}
      </div>
      {error.digest && <p className="text-xs text-muted-foreground">{t("errors.code", { code: error.digest })}</p>}
    </div>
  );
}
