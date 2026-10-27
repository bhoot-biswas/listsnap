import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Camera, ChevronRight } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

/** S3 Dashboard, v0: a greeting, the main action and recent jobs. v1 comes in Phase 5. */
export default async function DashboardPage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const format = await getFormatter();
  const jobs = await forWorkspace(viewer.workspace.id).recentJobs(12);
  const name = viewer.user.isDemo ? tNav("demoSeller") : viewer.user.name.split(" ")[0];

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
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-6">
        <section>
          <h2 className="text-2xl font-semibold">{t("hello", { name })}</h2>
          <p className="mt-1 text-muted-foreground">{t("intro")}</p>
        </section>

        <section aria-labelledby="recent" className="space-y-3">
          <h3 id="recent" className="text-base font-semibold">
            {t("recent")}
          </h3>
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
              <Camera className="size-10 text-primary" aria-hidden="true" />
              <p className="max-w-sm text-muted-foreground">{t("empty")}</p>
              <ButtonLink href="/snap" size="lg">
                {t("snapFirst")}
              </ButtonLink>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/job/${job.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {job.photo_media_id && (
                        <Image
                          src={mediaUrl(job.photo_media_id)}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t(`jobStatus.${job.status}`)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format.relativeTime(job.created_at)} · {t("listingsCount", { count: Number(job.listings) })}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
