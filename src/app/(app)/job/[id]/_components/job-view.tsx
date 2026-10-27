"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";
import { StatusBadge } from "@/components/app/status-badge";
import { useJobRunner } from "@/hooks/use-job-runner";
import type { JobState } from "@/lib/job-state";
import { StepList } from "./step-list";
import { ChooseItems } from "./choose-items";
import { UnderTheHood } from "./under-the-hood";
import { SaveToStore } from "./save-to-store";

const SAVABLE = new Set(["ready", "needs_review"]);

export function JobView({ initial }: { initial: JobState }) {
  const t = useTranslations("job");
  const tCommon = useTranslations("common");
  const { state, offline, retry, choose } = useJobRunner(initial);
  const photo = state.photos[0];
  const finished = state.status === "ready";
  const savable = finished ? state.listings.filter((l) => SAVABLE.has(l.status)) : [];
  const inStore = state.listings.some((l) => l.status === "in_store" || l.status === "posted");

  return (
    <>
      <TopBar title={t("title")} />
      {offline && (
        <p role="status" className="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-sm">
          <WifiOff className="size-4" aria-hidden="true" />
          {t("offline")}
        </p>
      )}
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
            {photo && (
              <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
                <Image
                  src={photo.url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 280px"
                  className="object-contain"
                  unoptimized
                  priority
                />
              </div>
            )}
            <StepList state={state} onRetry={retry} />
          </div>

          {state.status === "awaiting_choice" && <ChooseItems state={state} onChoose={choose} />}

          {state.listings.length > 0 && (
            <section className="space-y-3">
              {finished && state.listings.some((l) => l.status !== "failed") && (
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">{t("doneTitle", { count: state.listings.length })}</h2>
                  <p className="text-sm text-muted-foreground">{t("doneBody")}</p>
                </div>
              )}
              <ul className="grid gap-4 sm:grid-cols-2">
                {state.listings.map((l, i) => (
                  <li key={l.id} className="space-y-3 rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t("listing", { n: i + 1 })}</p>
                        <p className="font-medium">{l.title ?? "…"}</p>
                        {l.titleBn && (
                          <p lang="bn" className="text-[1.06em] text-muted-foreground">
                            {l.titleBn}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={l.status} />
                    </div>
                    {l.stockQty && <p className="text-sm">{t("stock", { qty: l.stockQty })}</p>}
                    <div className="grid grid-cols-4 gap-2">
                      {l.images.map((img) => (
                        <figure
                          key={img.id}
                          className="relative aspect-square overflow-hidden rounded-md border bg-muted"
                        >
                          <Image
                            src={img.url}
                            alt={l.title ?? ""}
                            fill
                            sizes="96px"
                            className="object-cover"
                            unoptimized
                          />
                          {img.kind !== "main" && (
                            <figcaption className="absolute inset-x-0 bottom-0 bg-black/55 px-1 text-center text-[10px] text-white">
                              {img.kind === "lifestyle" ? tCommon("aiScene") : tCommon("aiBackground")}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                    {savable.length > 1 && SAVABLE.has(l.status) && (
                      <SaveToStore jobId={state.id} listingIds={[l.id]} label={t("saveOne")} variant="outline" />
                    )}
                  </li>
                ))}
              </ul>
              {finished && (
                <div className="flex flex-wrap gap-3">
                  {savable.length > 0 && (
                    <SaveToStore
                      jobId={state.id}
                      listingIds={savable.map((l) => l.id)}
                      label={savable.length > 1 ? t("saveAll", { count: savable.length }) : t("saveOne")}
                    />
                  )}
                  {inStore && (
                    <ButtonLink href={`/job/${state.id}/done`} variant="outline" size="lg">
                      {t("seeSaved")}
                    </ButtonLink>
                  )}
                  <ButtonLink href="/snap" variant={savable.length || inStore ? "ghost" : "default"} size="lg">
                    {t("newListing")}
                  </ButtonLink>
                </div>
              )}
            </section>
          )}
        </div>

        <UnderTheHood state={state} />
      </div>
    </>
  );
}
