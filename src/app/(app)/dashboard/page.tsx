import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Camera, CircleAlert } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { RecentListings } from "@/components/app/recent-listings";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { Activity } from "./_components/activity";
import { NeedsAttention } from "./_components/needs-attention";
import { GetStarted, UsageToday, WeekBars } from "./_components/side-panels";
import { StatTiles } from "./_components/stat-tiles";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

/** S3 Dashboard: what needs attention today, a few numbers, and the way to the next listing. */
export default async function DashboardPage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const ws = forWorkspace(viewer.workspace.id);
  const { isDemo } = viewer.workspace;
  const [stats, attention, recent, activity, days, checklist, store] = await Promise.all([
    ws.dashboardStats(),
    ws.attention(5),
    ws.recentListings(5),
    ws.activity(8),
    ws.listingsPerDay(),
    ws.checklist(),
    isDemo ? null : ws.storeConnection("woo"),
  ]);
  // the demo shop saves to our test store, so it counts as connected
  const done = { ...checklist, store: checklist.store || isDemo };
  const name = viewer.user.isDemo ? tNav("demoSeller") : viewer.user.name.split(" ")[0];
  const brandNew = recent.length === 0;
  const allDone = Object.values(done).every(Boolean);

  return (
    <>
      <TopBar
        title={t("title")}
        actions={
          <ButtonLink href="/snap" className="max-md:hidden">
            <Camera />
            {tNav("newListing")}
          </ButtonLink>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
        <section>
          <h2 className="text-2xl font-semibold">{t("hello", { name })}</h2>
          <p className="mt-1 text-muted-foreground">
            {viewer.workspace.name} ·{" "}
            {isDemo ? t("storeDemo") : store?.status === "connected" ? t("storeConnected") : t("storeMissing")}
          </p>
        </section>

        {store?.status === "broken" && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          >
            <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm">{t("storeBroken")}</p>
            <ButtonLink href="/connections" variant="outline" className="h-11 md:h-9">
              {t("fixConnection")}
            </ButtonLink>
          </div>
        )}

        {brandNew ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
            <Camera className="size-10 text-primary" aria-hidden="true" />
            <p className="max-w-sm text-muted-foreground">{t("empty")}</p>
            <ButtonLink href="/snap" size="lg">
              {t("snapFirst")}
            </ButtonLink>
          </div>
        ) : (
          <StatTiles stats={stats} />
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            {!brandNew && <NeedsAttention rows={attention} />}
            {!brandNew && (
              <RecentListings
                rows={recent}
                heading={t("recent")}
                empty={t("empty")}
                action={
                  <Link href="/listings" className="text-sm font-medium text-primary hover:underline">
                    {t("allListings")}
                  </Link>
                }
              />
            )}
            <Activity rows={activity} />
          </div>
          <div className="space-y-6">
            <UsageToday listings={stats.listedToday} images={stats.imagesToday} limits={viewer.workspace.limits} />
            {!allDone && <GetStarted done={done} />}
            {!brandNew && <WeekBars days={days} />}
          </div>
        </div>
      </div>
    </>
  );
}
