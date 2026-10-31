import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CircleAlert, ExternalLink } from "lucide-react";
import type { StoreActivity } from "@/server/connections/activity";
import { relativeTime } from "@/lib/relative-time";
import { DetailSection } from "./detail-header";

/** The last drafts saved to this store, and the last failure when nothing has been saved since. */
export async function ActivitySection({ id, activity }: { id: string; activity: StoreActivity }) {
  const t = await getTranslations("connections.activity");
  const format = await getFormatter();
  const { saves, failure } = activity;

  return (
    <DetailSection id={id} title={t("title")}>
      {failure && (
        <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{t("failed", { time: relativeTime(format, failure.at) })}</p>
            {failure.reason && <p className="text-muted-foreground">{failure.reason}</p>}
            <Link
              href={failure.href}
              className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline md:min-h-0"
            >
              {failure.title ?? t("untitled")}
            </Link>
          </div>
        </div>
      )}
      {saves.length ? (
        <ul className="divide-y">
          {saves.map((s) => (
            <li key={s.listingId} className="flex flex-wrap items-center gap-x-3 py-1">
              <div className="min-w-0 flex-1">
                <Link
                  href={s.href}
                  className="flex min-h-11 flex-col justify-center text-sm hover:underline md:min-h-10"
                >
                  <span className="truncate font-medium">{s.title ?? t("untitled")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("saved", { time: relativeTime(format, s.savedAt) })}
                  </span>
                </Link>
              </div>
              {s.storeUrl && (
                <a
                  href={s.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-10"
                >
                  {t("openInStore")}
                  <ExternalLink className="size-3" aria-hidden="true" />
                  <span className="sr-only">{t("newTab")}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !failure && <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
    </DetailSection>
  );
}
