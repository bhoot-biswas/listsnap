import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CircleCheck, Clapperboard, ExternalLink } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { loadJobState } from "@/server/pipeline/job-state";
import type { StoreResult } from "@/server/pipeline/store-step";
import type { JobState } from "@/lib/job-state";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("done"))("title") };
}

/** Time from upload to the last model call; store saves don't count. Null for jobs nothing was timed on. */
function makingSeconds(state: JobState): number | null {
  const calls = state.calls.filter((c) => c.step !== "store");
  if (!calls.length) return null;
  const end = Math.max(...calls.map((c) => Date.parse(c.at) + c.ms));
  return Math.max(1, Math.round((end - Date.parse(state.createdAt)) / 1000));
}

/** S8 Done: what was saved to the store, and where to go next (a reel or post is made on Review). */
export default async function DonePage({ params }: PageProps<"/job/[id]/done">) {
  const viewer = await requireWorkspace();
  const { id } = await params;
  const state = await loadJobState(viewer.workspace, id);
  if (!state) notFound();
  const ws = forWorkspace(viewer.workspace.id);
  const saved = await Promise.all(
    state.listings
      .filter((l) => l.status === "in_store" || l.status === "posted")
      .map(async (l) => ({ listing: l, store: await ws.stepResult<StoreResult>(id, "store", l.id) })),
  );
  if (!saved.length) redirect(`/job/${id}`);

  const t = await getTranslations("done");
  const seconds = makingSeconds(state);
  const linkClass = cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full");

  return (
    <>
      <TopBar title={t("title")} />
      <div className="mx-auto w-full max-w-md px-4 py-10 md:px-6">
        <section aria-labelledby="done-title" className="space-y-6 rounded-xl border bg-card p-6 text-center">
          <CircleCheck className="mx-auto size-12 text-success" aria-hidden="true" />
          <div className="space-y-2">
            <h2 id="done-title" className="text-2xl font-semibold">
              {t("heading", { count: saved.length })}
            </h2>
            {saved.length === 1 && (
              <p className="text-muted-foreground">{t("body", { title: saved[0]!.listing.title ?? "" })}</p>
            )}
          </div>

          {saved.length > 1 && (
            <ul className="divide-y rounded-lg border text-left">
              {saved.map(({ listing, store }) => (
                <li key={listing.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Link
                    href={`/job/${id}/review?l=${listing.id}`}
                    className="inline-flex min-h-11 min-w-0 items-center text-sm hover:underline"
                  >
                    <span className="truncate">{listing.title}</span>
                  </Link>
                  {store && (
                    <a
                      href={store.editUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-primary"
                    >
                      {t("open")}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3">
            {saved.length === 1 && saved[0]!.store && (
              <a href={saved[0]!.store.editUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {t("openInStore")}
                <ExternalLink aria-hidden="true" />
              </a>
            )}
            {saved.length === 1 && (
              <ButtonLink
                href={`/job/${id}/review?l=${saved[0]!.listing.id}`}
                variant="outline"
                size="lg"
                className="w-full"
              >
                <Clapperboard aria-hidden="true" />
                {t("reelOrPost")}
              </ButtonLink>
            )}
            <ButtonLink href="/snap" size="lg" className="w-full">
              {t("snapAnother")}
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="ghost" className="w-full">
              {t("toDashboard")}
            </ButtonLink>
          </div>

          {saved.length > 1 && <p className="text-sm text-muted-foreground">{t("reelOrPostMany")}</p>}
          {seconds !== null && (
            <p className="text-xs text-muted-foreground">
              {t("stats", { seconds, cost: state.costUsd.toFixed(state.costUsd < 0.01 ? 3 : 2) })}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
