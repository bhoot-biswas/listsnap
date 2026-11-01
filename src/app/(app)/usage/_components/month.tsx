import { getFormatter, getTranslations } from "next-intl/server";
import type { UsageDay } from "@/server/db/scope";
import { cn } from "@/lib/utils";

const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Listings per day for 30 days as plain bars, with the month's totals above. */
export async function MonthChart({ days, totals }: { days: UsageDay[]; totals: { listings: number; photos: number } }) {
  const t = await getTranslations("usage.month");
  const format = await getFormatter();
  const max = Math.max(1, ...days.map((d) => d.listings));
  const short = (day: string) => format.dateTime(dayDate(day), { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <section aria-labelledby="month" className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="month" className="text-base font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("totals", {
            listings: format.number(totals.listings),
            photos: format.number(totals.photos),
          })}
        </p>
      </div>
      <ul className="flex h-32 items-end gap-[3px] md:gap-1" aria-label={t("chart")}>
        {days.map((d) => (
          <li
            key={d.day}
            className="flex h-full flex-1 flex-col justify-end"
            title={t("bar", { day: short(d.day), count: d.listings })}
          >
            <span
              className={cn("w-full rounded-t-sm", d.listings ? "bg-primary" : "bg-muted")}
              style={{ height: `${Math.max(3, (d.listings / max) * 100)}%` }}
              aria-hidden="true"
            />
            <span className="sr-only">{t("bar", { day: short(d.day), count: d.listings })}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
        <span>{short(days[0]!.day)}</span>
        <span>{short(days.at(-1)!.day)}</span>
      </div>
    </section>
  );
}

/** Each day with any activity, newest first, folded away by default; the CSV has all 30. */
export async function DayTable({ days, money }: { days: UsageDay[]; money: (n: number) => string }) {
  const t = await getTranslations("usage.days");
  const format = await getFormatter();
  const active = days.filter((d) => d.listings || d.photos || d.calls).reverse();
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 text-base font-semibold md:px-5">
        {t("title")}
        <a
          href="/api/usage/csv"
          download
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline md:min-h-0"
        >
          {t("csv")}
        </a>
      </summary>
      {active.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground md:px-5">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium md:px-5">
                  {t("day")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("listings")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("photos")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("calls")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium md:px-5">
                  {t("cost")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {active.map((d) => (
                <tr key={d.day}>
                  <td className="px-4 py-2 whitespace-nowrap md:px-5">
                    {format.dateTime(dayDate(d.day), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="px-3 py-2 text-right">{format.number(d.listings)}</td>
                  <td className="px-3 py-2 text-right">{format.number(d.photos)}</td>
                  <td className="px-3 py-2 text-right">{format.number(d.calls)}</td>
                  <td className="px-4 py-2 text-right md:px-5">{money(d.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
