import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, CircleAlert, CirclePause } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { listingHref } from "@/lib/listing-links";
import { localTitle } from "@/lib/titles";
import type { AttentionRow } from "@/server/db/scope";

/** Unsure drafts, failed steps and unfinished jobs, each with one button. Empty reads as good news. */
export async function NeedsAttention({ rows }: { rows: AttentionRow[] }) {
  const t = await getTranslations("dashboard.attention");
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <section aria-labelledby="attention" className="space-y-3">
      <h2 id="attention" className="text-base font-semibold">
        {t("title")}
      </h2>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          {t("allClear")}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((r) => {
            const failed = r.kind === "failed";
            const paused = r.kind === "choose" || r.kind === "unfinished";
            const Icon = failed ? CircleAlert : paused ? CirclePause : AlertTriangle;
            const tone = failed ? "text-destructive" : paused ? "text-muted-foreground" : "text-warning";
            const href = paused
              ? (`/job/${r.job_id}` as const)
              : listingHref({ ...r, id: r.listing_id, status: failed ? "failed" : "needs_review" });
            return (
              <li key={`${r.kind}-${r.listing_id ?? r.job_id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <Icon className={`size-4 ${tone}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p lang={localTitle(r, locale).lang} className="truncate text-sm font-medium">
                    {localTitle(r, locale).text ?? t(paused ? "unfinishedTitle" : "untitled")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(r.kind)} · {format.relativeTime(r.created_at)}
                  </p>
                </div>
                <ButtonLink href={href} variant="outline" size="sm" className="h-11 md:h-8">
                  {t(failed ? "open" : paused ? "continue" : "check")}
                </ButtonLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
