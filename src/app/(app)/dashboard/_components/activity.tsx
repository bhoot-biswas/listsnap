import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { listingHref } from "@/lib/listing-links";
import { localTitle } from "@/lib/titles";
import type { ActivityRow } from "@/server/db/scope";
import { relativeTime } from "@/lib/relative-time";

/** What changed lately: drafts sent to the store and connection changes. */
export async function Activity({ rows }: { rows: ActivityRow[] }) {
  const t = await getTranslations("dashboard.activity");
  const format = await getFormatter();
  const locale = await getLocale();
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="activity" className="space-y-3">
      <h2 id="activity" className="text-base font-semibold">
        {t("title")}
      </h2>
      <ol className="space-y-2.5 border-l pl-4">
        {rows.map((e) => (
          <li key={e.id} className="text-sm">
            {e.type === "sent_to_store" && e.job_id ? (
              <Link
                href={listingHref({ job_id: e.job_id, id: e.ref_id, status: "in_store" })}
                className="inline-flex min-h-11 items-center hover:underline md:min-h-0"
              >
                {t("sent_to_store", { title: localTitle(e, locale).text ?? t("untitled") })}
              </Link>
            ) : (
              <span>{t(e.type === "connection_removed" ? "removed" : "saved", { kind: e.ref_id ?? "woo" })}</span>
            )}
            <span className="block text-xs text-muted-foreground">{relativeTime(format, e.created_at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
