import { getFormatter, getTranslations } from "next-intl/server";
import { PartyPopper } from "lucide-react";
import { ButtonLink } from "./button-link";
import { nextReset } from "./usage-meter";

/**
 * Shown instead of the upload form once today's listings are used up. It celebrates
 * rather than scolds, says exactly when it starts again, and never leaves a dead end.
 */
export async function LimitReached({ limit, isDemo }: { limit: number; isDemo: boolean }) {
  const t = await getTranslations("limits");
  const format = await getFormatter();
  const reset = nextReset();
  return (
    <section
      aria-labelledby="limit-title"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border bg-card px-6 py-12 text-center"
    >
      <PartyPopper className="size-10 text-primary" aria-hidden="true" />
      <h2 id="limit-title" className="text-xl font-semibold">
        {t("title", { count: limit })}
      </h2>
      <p className="text-muted-foreground">
        {t("body", {
          time: format.dateTime(reset, { hour: "numeric", minute: "2-digit" }),
          when: format.relativeTime(reset, new Date()),
        })}
      </p>
      {isDemo && <p className="text-sm text-muted-foreground">{t("demo")}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink href="/listings?status=needs_review" className="h-11">
          {t("review")}
        </ButtonLink>
        <ButtonLink href="/usage" variant="outline" className="h-11">
          {t("usage")}
        </ButtonLink>
      </div>
    </section>
  );
}
