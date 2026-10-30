"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { CircleAlert, Lightbulb, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";
import { StatusBadge } from "@/components/app/status-badge";
import { useJobRunner } from "@/hooks/use-job-runner";
import type { JobState } from "@/lib/job-state";
import { StepList } from "./step-list";
import { ChooseItems } from "./choose-items";
import { UnderTheHood } from "./under-the-hood";
import { SaveToStore } from "@/components/app/save-to-store";
import { PhotoStage } from "./photo-stage";
import { BeforeAfter } from "./before-after";
import { lookOf } from "@/lib/schemas/looks";

const SAVABLE = new Set(["ready", "needs_review"]);
const EDITABLE = new Set(["ready", "needs_review", "in_store", "posted"]);

export function JobView({ initial }: { initial: JobState }) {
  const t = useTranslations("job");
  const tCommon = useTranslations("common");
  const { state, offline, stalled, retry, choose, resume } = useJobRunner(initial);
  const photo = state.photos[0];
  const finished = state.status === "ready";
  const savable = finished ? state.listings.filter((l) => SAVABLE.has(l.status)) : [];
  const inStore = state.listings.some((l) => l.status === "in_store" || l.status === "posted");
  // compare the photo with the first listing's studio scene, or its cutout until that's made
  const first = state.listings[0];
  const compare =
    first?.images.find((i) => i.kind === "studio")?.url ?? first?.images.find((i) => i.kind === "main")?.url;
  const box = state.items[0]?.box;
  const focus =
    photo && box
      ? { x: ((box.x + box.w / 2) / photo.width) * 100, y: ((box.y + box.h / 2) / photo.height) * 100 }
      : { x: 50, y: 50 };
  /** Scenes still being made for a listing, shown as placeholder tiles. */
  const pendingScenes = (l: (typeof state.listings)[number]) =>
    finished || l.status === "failed"
      ? 0
      : Math.max(0, state.scenes.length - l.images.filter((i) => i.kind !== "main").length);

  return (
    <>
      <TopBar title={t("title")} />
      {offline && (
        <p role="status" className="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-sm">
          <WifiOff className="size-4" aria-hidden="true" />
          {t("offline")}
        </p>
      )}
      {stalled && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-3 bg-destructive/5 px-4 py-2 text-sm"
        >
          <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
          {t("stalled")}
          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => void resume()}>
            {tCommon("tryAgain")}
          </Button>
        </div>
      )}
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              {photo && <PhotoStage photo={photo} items={state.items} />}
              {photo && compare && <BeforeAfter before={photo.url} after={compare} focus={focus} />}
            </div>
            <div className="space-y-4">
              <StepList state={state} onRetry={retry} />
              {state.status === "processing" && <p className="text-sm text-muted-foreground">{t("keepOpen")}</p>}
              {state.check && state.check.hints.length > 0 && (
                <aside className="space-y-2 rounded-xl border border-warning/40 bg-marigold-soft p-4 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <Lightbulb className="size-4 text-warning" aria-hidden="true" />
                    {t("hintTitle")}
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {state.check.hints.map((h) => (
                      <li key={h}>{t(`hints.${h}`, { fill: state.check!.fillPercent })}</li>
                    ))}
                  </ul>
                  <ButtonLink href="/snap" variant="outline">
                    {t("retake")}
                  </ButtonLink>
                </aside>
              )}
            </div>
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
                    <div className="grid grid-cols-4 gap-2" aria-busy={pendingScenes(l) > 0}>
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
                              {img.kind === "lifestyle" || lookOf(img.kind)
                                ? tCommon("aiScene")
                                : tCommon("aiBackground")}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                      {Array.from({ length: pendingScenes(l) }, (_, k) => (
                        <div
                          key={`pending-${k}`}
                          className="aspect-square animate-pulse rounded-md border border-dashed bg-muted"
                        />
                      ))}
                    </div>
                    {l.title && EDITABLE.has(l.status) && (
                      <div className="flex flex-wrap gap-2">
                        <ButtonLink
                          href={`/job/${state.id}/review?l=${l.id}`}
                          variant={finished ? "outline" : "default"}
                        >
                          {finished ? t("review") : t("reviewNow")}
                        </ButtonLink>
                        {finished && savable.length > 1 && SAVABLE.has(l.status) && (
                          <SaveToStore jobId={state.id} listingIds={[l.id]} label={t("saveOne")} variant="outline" />
                        )}
                      </div>
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
