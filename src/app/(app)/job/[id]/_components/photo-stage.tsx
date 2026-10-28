"use client";

import { useTranslations } from "next-intl";
import type { ItemView } from "@/lib/job-state";

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * The photo with what SAM found. Once segment is done the photo dims and each item's
 * real cutout wipes in on top, in place, with a glowing edge, so the seller sees the
 * exact shape SAM took. Mock jobs have no mask, so their boxes are drawn instead.
 */
export function PhotoStage({
  photo,
  items,
}: {
  photo: { url: string; width: number; height: number };
  items: ItemView[];
}) {
  const t = useTranslations("job");
  const found = items.length > 0;
  return (
    <figure className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border bg-muted"
        style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private /media file, sized by the box above */}
        <img src={photo.url} alt="" className="absolute inset-0 size-full object-cover" />
        {found && <div className="absolute inset-0 bg-black/55" style={{ animation: "sam-dim 600ms ease-out both" }} />}
        {items.map((item, i) =>
          item.png ? (
            // eslint-disable-next-line @next/next/no-img-element -- the cutout must sit exactly on its box
            <img
              key={item.id}
              src={item.png}
              alt=""
              className="absolute object-fill"
              style={{
                left: pct(item.box.x, photo.width),
                top: pct(item.box.y, photo.height),
                width: pct(item.box.w, photo.width),
                height: pct(item.box.h, photo.height),
                filter: "drop-shadow(0 0 2px #fff) drop-shadow(0 0 10px var(--color-primary))",
                animation: `sam-reveal 900ms ease-out ${300 + i * 250}ms both`,
              }}
            />
          ) : null,
        )}
        {found && items.some((i) => !i.png) && (
          <svg
            className="absolute inset-0 size-full"
            viewBox={`0 0 ${photo.width} ${photo.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {items
              .filter((i) => !i.png)
              .map((item, i) => (
                <rect
                  key={item.id}
                  x={item.box.x}
                  y={item.box.y}
                  width={item.box.w}
                  height={item.box.h}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={Math.max(2, photo.width / 300)}
                  strokeDasharray="400"
                  vectorEffect="non-scaling-stroke"
                  style={{ animation: `sam-box 900ms ease-out ${300 + i * 250}ms both` }}
                />
              ))}
          </svg>
        )}
      </div>
      {found && (
        <figcaption className="text-xs text-muted-foreground" aria-live="polite">
          {t("foundCaption", { count: items.length })}
        </figcaption>
      )}
    </figure>
  );
}
