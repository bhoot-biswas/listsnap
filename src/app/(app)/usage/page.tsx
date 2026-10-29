import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { TopBar } from "@/components/app/top-bar";
import { buttonVariants } from "@/components/ui/button";
import { UsageMeter, nextReset } from "@/components/app/usage-meter";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { cn } from "@/lib/utils";
import { CallLog } from "./_components/call-log";
import { DayTable, MonthChart } from "./_components/month";
import { StepCosts } from "./_components/step-costs";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("usage") };
}

const usd = (format: Awaited<ReturnType<typeof getFormatter>>, n: number) =>
  format.number(n, { style: "currency", currency: "USD", maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2 });

/**
 * S14 Usage: today against the daily limits, the last 30 days, what each step costs and
 * the newest AI calls. Everything comes from the API log, so the numbers are the real ones.
 */
export default async function UsagePage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("usage");
  const format = await getFormatter();
  const ws = forWorkspace(viewer.workspace.id);
  const [days, today, steps, calls, used] = await Promise.all([
    ws.usageDays(),
    ws.callsToday(),
    ws.usageBySteps(),
    ws.recentCalls(25),
    ws.usageToday(),
  ]);
  const total = days.reduce(
    (a, d) => ({ listings: a.listings + d.listings, photos: a.photos + d.photos, cost: a.cost + d.cost }),
    { listings: 0, photos: 0, cost: 0 },
  );
  const { limits } = viewer.workspace;
  const money = (n: number) => usd(format, n);

  return (
    <>
      <TopBar
        title={t("title")}
        actions={
          // a plain link: the file downloads instead of the app trying to show it as a page
          <a href="/api/usage/csv" download className={cn(buttonVariants({ variant: "outline" }), "max-md:hidden")}>
            <Download />
            {t("csv")}
          </a>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="today" className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
            <h2 id="today" className="text-base font-semibold">
              {t("today")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <UsageMeter label={t("listings")} used={used.listings} limit={limits.listings} />
              <UsageMeter label={t("photos")} used={used.images} limit={limits.images} />
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t pt-4">
              <div>
                <dt className="text-xs text-muted-foreground">{t("aiCost")}</dt>
                <dd className="text-xl font-semibold tabular-nums">{money(today.cost)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("aiCalls")}</dt>
                <dd className="text-xl font-semibold tabular-nums">{format.number(today.calls)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {t("resets", {
                time: format.dateTime(nextReset(), { hour: "numeric", minute: "2-digit" }),
                when: format.relativeTime(nextReset(), new Date()),
              })}
            </p>
          </section>

          <section aria-labelledby="plan" className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
            <h2 id="plan" className="text-base font-semibold">
              {t("plan.title")}
            </h2>
            <p className="text-2xl font-semibold">{t("plan.free")}</p>
            <p className="text-sm text-muted-foreground">
              {t("plan.limits", { listings: limits.listings, photos: limits.images })}
            </p>
            <p className="text-sm text-muted-foreground">{t("plan.pro")}</p>
            <ButtonLink href="/pricing" variant="outline" className="h-11 md:h-9">
              {t("plan.pricing")}
            </ButtonLink>
          </section>
        </div>

        <MonthChart days={days} totals={{ ...total, cost: money(total.cost) }} />
        <StepCosts steps={steps} money={money} />
        <CallLog calls={calls} />
        <DayTable days={days} money={money} />
      </div>
    </>
  );
}
