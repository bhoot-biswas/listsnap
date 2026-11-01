"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MediaImg } from "@/components/app/media-img";

/** Across the screen on a phone; the 320 px photo column from tablet width up (job-view). */
const SIZES = "(max-width: 767px) 100vw, 320px";

/**
 * The seller's photo and the result, one over the other, with a slider between them.
 * The photo is framed on the product (`focus`, in percent) so both show the same thing.
 */
export function BeforeAfter({
  before,
  after,
  focus,
}: {
  before: string;
  after: string;
  focus: { x: number; y: number };
}) {
  const t = useTranslations("job");
  const [split, setSplit] = useState(50);
  return (
    <figure className="space-y-2">
      <div className="relative aspect-square overflow-hidden rounded-xl border bg-white">
        <MediaImg src={after} sizes={SIZES} alt="" className="absolute inset-0 size-full object-cover" />
        {/* the "before" layer, clipped by the slider */}
        <MediaImg
          src={before}
          sizes={SIZES}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: `${focus.x}% ${focus.y}%`, clipPath: `inset(0 ${100 - split}% 0 0)` }}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }} />
        <span className="absolute top-2 left-2 rounded bg-black/60 px-1.5 text-xs text-white">{t("before")}</span>
        <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 text-xs text-white">{t("after")}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label={t("compare")}
        className="h-11 w-full accent-primary"
      />
    </figure>
  );
}
