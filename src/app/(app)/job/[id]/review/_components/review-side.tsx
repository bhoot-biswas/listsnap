"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ConfidenceDots } from "@/components/app/confidence-dots";
import { cn } from "@/lib/utils";
import { lookOf } from "@/lib/schemas/looks";

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
        <div className="relative aspect-square overflow-hidden rounded-xl border bg-white">
          <Image
            src={main.url}
            alt={title}
            fill
            sizes="(max-width: 1024px) 100vw, 360px"
            className="object-contain"
            unoptimized
            priority
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
                <Image src={p.url} alt="" fill sizes="90px" className="object-cover" unoptimized />
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

/** Confidence as five dots and a word, plus what Spark said to check; never a raw percentage. */
export function ConfidencePanel({ confidence, notes }: { confidence: number | null; notes: string[] }) {
  const t = useTranslations("review");
  return (
    <section aria-labelledby="confidence-title" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="confidence-title" className="text-sm font-semibold">
          {t("confidence")}
        </h2>
        <ConfidenceDots confidence={confidence} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("toCheck")}</p>
        {notes.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nothingToCheck")}</p>
        )}
      </div>
    </section>
  );
}
