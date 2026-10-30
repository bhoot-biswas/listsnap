import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronRight, Layers } from "lucide-react";
import { LimitReached } from "@/components/app/limit-reached";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { MAX_BULK } from "@/lib/batch-state";
import { BulkUploadButton } from "./_components/bulk-upload-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("bulk"))("title") };
}

/** S11 Bulk list: every bulk upload with how far it got, and a new upload. */
export default async function BulkPage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("bulk");
  const tStatus = await getTranslations("status");
  const format = await getFormatter();
  const ws = forWorkspace(viewer.workspace.id);
  const [batches, used] = await Promise.all([ws.batches(), ws.usageToday()]);
  const { limits } = viewer.workspace;
  const left = limits.listings - used.listings;
  return (
    <>
      <TopBar title={t("title")} />
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
        {left <= 0 ? (
          <LimitReached limit={limits.listings} isDemo={viewer.workspace.isDemo} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted-foreground">{t("intro", { max: Math.min(MAX_BULK, left) })}</p>
            <BulkUploadButton
              max={Math.min(MAX_BULK, left)}
              listingsLeft={left}
              imagesLeft={Math.max(0, limits.images - used.images)}
              scenesPerListing={viewer.workspace.settings.scenes.length}
            />
          </div>
        )}
        {batches.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
            <Layers className="size-10 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {batches.map((b) => {
              const done = b.jobs - b.processing;
              return (
                <li key={b.id}>
                  <Link href={`/bulk/${b.id}`} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-muted/60">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">
                        {t("photos", { count: b.jobs })}{" "}
                        <span className="font-normal text-muted-foreground">· {format.relativeTime(b.created_at)}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("summary", { done, total: b.jobs })}
                        {b.ready > 0 && ` · ${b.ready} ${tStatus("ready")}`}
                        {b.needs_review > 0 && ` · ${b.needs_review} ${tStatus("needs_review")}`}
                        {b.in_store > 0 && ` · ${b.in_store} ${tStatus("in_store")}`}
                        {b.failed > 0 && ` · ${b.failed} ${tStatus("failed")}`}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
