import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { listingHref } from "@/lib/listing-links";
import type { AttentionRow } from "@/server/db/scope";

/** Unsure drafts and failed steps, each with one button. Empty reads as good news. */
export async function NeedsAttention({ rows }: { rows: AttentionRow[] }) {
  const t = await getTranslations("dashboard.attention");
  const format = await getFormatter();
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
            const Icon = failed ? CircleAlert : AlertTriangle;
            return (
              <li key={`${r.kind}-${r.listing_id ?? r.job_id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <Icon className={failed ? "size-4 text-destructive" : "size-4 text-warning"} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title ?? t("untitled")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(failed ? "failed" : "review")} · {format.relativeTime(r.created_at)}
                  </p>
                </div>
                <ButtonLink
                  href={listingHref({ ...r, id: r.listing_id, status: failed ? "failed" : "needs_review" })}
                  variant="outline"
                  size="sm"
                  className="h-11 md:h-8"
                >
                  {t(failed ? "open" : "check")}
                </ButtonLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
