"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ConfidenceDots } from "@/components/app/confidence-dots";
import type { ListingStatus } from "@/components/app/status-badge";
import { setListingChecked } from "@/server/actions/review";
import { cn } from "@/lib/utils";
import { lookOf } from "@/lib/schemas/looks";
import { sized } from "@/lib/media-size";
import { MediaImg } from "@/components/app/media-img";

export interface ReviewPhoto {
  id: string;
  url: string;
  kind: string;
  selected: boolean;
  /** The main image always goes to the store. */
  locked: boolean;
}

/** The photos column: the main image large, then each image as a tile that toggles inclusion. */
export function ReviewPhotos({
  photos,
  title,
  selected,
  onToggle,
}: {
  photos: ReviewPhoto[];
  /** The listing's title, which describes the main photo for screen readers. */
  title: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tScenes = useTranslations("job.scenes");
  const name = (p: ReviewPhoto) => {
    const look = lookOf(p.kind);
    if (look) return t(`looks.names.${look}`);
    return p.kind === "main"
      ? t("mainImage")
      : p.kind in { studio: 1, lifestyle: 1, banner: 1 }
        ? tScenes(p.kind)
        : p.kind;
  };
  // lifestyle and looks redraw the product; studio and banner keep its real pixels
  const aiScene = (p: ReviewPhoto) => p.kind === "lifestyle" || lookOf(p.kind) !== null;
  const main = photos[0];

  return (
    <section aria-labelledby="photos-title" className="space-y-3">
      <h2 id="photos-title" className="text-base font-semibold">
        {t("photos")}
      </h2>
      {main && (
        // smaller on a phone, so the checks below it start on the first screen
        <div className="relative mx-auto aspect-square w-full max-w-60 overflow-hidden rounded-xl border bg-white sm:max-w-none">
          <MediaImg
            src={main.url}
            alt={title}
            sizes="(max-width: 640px) 240px, (max-width: 1024px) 100vw, 360px"
            className="absolute inset-0 size-full object-contain"
            eager
          />
        </div>
      )}
      <ul className="grid grid-cols-4 gap-2">
        {photos.map((p) => {
          const on = p.locked || selected.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={p.locked}
                aria-label={t("include", { name: name(p) })}
                onClick={() => !p.locked && onToggle(p.id)}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-white",
                  on ? "border-primary" : "border-transparent opacity-60",
                  p.locked && "cursor-default",
                )}
              >
                <Image src={sized(p.url, 320)} alt="" fill sizes="90px" className="object-cover" unoptimized />
                {on && (
                  <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 text-center text-[10px] text-white">
                  {p.kind === "main"
                    ? t("mainImage")
                    : lookOf(p.kind)
                      ? name(p)
                      : aiScene(p)
                        ? tCommon("aiScene")
                        : tCommon("aiBackground")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("photosHint")}</p>
    </section>
  );
}

/**
 * What Spark said to check, as tick boxes, with its confidence as dots and a word (never a
 * raw percentage). With nothing flagged there is one item: read it through. Ticking every
 * item is the seller's review, so the listing moves from Needs review to Ready; unticking
 * one moves it back. Ticks aren't stored: a listing past Needs review opens with all ticked.
 */
export function CheckPanel({
  listingId,
  confidence,
  notes,
  status,
}: {
  listingId: string;
  confidence: number | null;
  notes: string[];
  status: ListingStatus;
}) {
  const t = useTranslations("review");
  const router = useRouter();
  const items = notes.length ? notes : [t("readItThrough")];
  const [ticked, setTicked] = useState(() => new Set(status === "needs_review" ? [] : items.map((_, i) => i)));
  const [failed, setFailed] = useState(false);
  const all = ticked.size === items.length;

  const toggle = async (i: number) => {
    const next = new Set(ticked);
    if (!next.delete(i)) next.add(i);
    setTicked(next);
    const nowAll = next.size === items.length;
    // the status changes only when the last box is ticked, or the first one unticked
    if (nowAll === all) return;
    const r = await setListingChecked(listingId, nowAll).catch(() => ({ ok: false }));
    setFailed(!r.ok);
    if (r.ok) router.refresh();
  };

  return (
    <section aria-labelledby="check-title" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="check-title" className="text-base font-semibold">
          {t("toCheck")}
        </h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("confidence")}
          <ConfidenceDots confidence={confidence} className="text-xs" />
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("checkHint")}</p>
      <ul className="space-y-1">
        {items.map((n, i) => {
          const on = ticked.has(i);
          return (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => void toggle(i)}
                className="flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted/60"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
                <span className={cn(on && "text-muted-foreground line-through")}>{n}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className="text-sm">
        {failed ? (
          <span className="text-destructive">{t("checkFailed")}</span>
        ) : (
          all && <span className="font-medium text-success">{t("allChecked")}</span>
        )}
      </p>
    </section>
  );
}
