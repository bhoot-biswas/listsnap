import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Check, Circle } from "lucide-react";
import { UsageMeter, nextReset } from "@/components/app/usage-meter";
import type { Checklist } from "@/server/db/scope";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";

/** Today's use against the daily limits, which reset at midnight UTC. */
export async function UsageToday({
  listings,
  images,
  limits,
}: {
  listings: number;
  images: number;
  limits: { listings: number; images: number };
}) {
  const t = await getTranslations("dashboard.usage");
  const format = await getFormatter();
  const now = new Date();
  const reset = nextReset(now);
  return (
    <section aria-labelledby="usage-today" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 id="usage-today" className="text-base font-semibold">
        {t("title")}
      </h2>
      <UsageMeter label={t("listings")} used={listings} limit={limits.listings} />
      <UsageMeter label={t("images")} used={images} limit={limits.images} />
      <p className="text-xs text-muted-foreground">{t("resets", { when: relativeTime(format, reset, now) })}</p>
    </section>
  );
}

const STEPS = [
  { key: "store", href: "/connections" },
  { key: "listing", href: "/snap" },
  { key: "bulk", href: "/bulk" },
  { key: "colors", href: "/snap" },
] as const;

/** Four first steps; the Dashboard hides this once all are done. */
export async function GetStarted({ done }: { done: Checklist }) {
  const t = await getTranslations("dashboard.getStarted");
  const count = STEPS.filter((s) => done[s.key]).length;
  return (
    <section aria-labelledby="get-started" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 id="get-started" className="text-base font-semibold">
          {t("title")}
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("progress", { count, total: STEPS.length })}
        </span>
      </div>
      <ul className="space-y-1">
        {STEPS.map((s) => (
          <li key={s.key}>
            {done[s.key] ? (
              <p className="flex min-h-11 items-center gap-2.5 text-sm text-muted-foreground line-through md:min-h-9">
                <Check className="size-4 text-success" aria-hidden="true" />
                <span className="sr-only">{t("done")}</span>
                {t(s.key)}
              </p>
            ) : (
              <Link
                href={s.href}
                className="-mx-2 flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm font-medium hover:bg-muted md:min-h-9"
              >
                <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                {t(s.key)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Listings per day for the last week: the Dashboard's only chart, kept to plain bars. */
export async function WeekBars({ days }: { days: { day: string; n: number }[] }) {
  const t = await getTranslations("dashboard.week");
  const format = await getFormatter();
  const max = Math.max(1, ...days.map((d) => d.n));
  const label = (day: string) => format.dateTime(new Date(`${day}T00:00:00Z`), { weekday: "short", timeZone: "UTC" });
  return (
    <section aria-labelledby="week-bars" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id="week-bars" className="text-base font-semibold">
        {t("title")}
      </h2>
      <ul className="flex h-28 items-end gap-2">
        {days.map((d) => (
          <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-muted-foreground tabular-nums">{d.n ? format.number(d.n) : ""}</span>
            <span
              className={cn("w-full rounded-t", d.n ? "bg-primary" : "bg-muted")}
              style={{ height: `${Math.max(4, (d.n / max) * 72)}px` }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">
              <span aria-hidden="true">{label(d.day)}</span>
              <span className="sr-only">{t("day", { day: label(d.day), count: d.n })}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
