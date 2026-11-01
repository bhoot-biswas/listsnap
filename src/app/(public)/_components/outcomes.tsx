import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ScanSearch } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { DEMO_SAMPLES, SAMPLE_SOURCE_SIZE } from "@/server/demo/samples";

const bangles = DEMO_SAMPLES.find((s) => s.key === "bangles")!;
const tag = "rounded-full px-2.5 py-0.5 text-xs font-medium";

/** Section 2: three things a seller walks away with, each shown on a real sample. */
export async function Outcomes() {
  const t = await getTranslations("landing");
  const tCommon = await getTranslations("common");
  const cards = [
    {
      key: "listing",
      media: (
        <>
          <Image
            src="/samples/bangles.jpg"
            alt={t("outcomes.listing.alt")}
            fill
            sizes="(min-width: 768px) 320px, 80vw"
            className="object-cover"
          />
          {/* What SAM 3.1 actually found in this photo, drawn in the photo's own coordinates */}
          <svg
            viewBox={`0 0 ${SAMPLE_SOURCE_SIZE} ${SAMPLE_SOURCE_SIZE}`}
            className="absolute inset-0 size-full"
            aria-hidden="true"
          >
            {bangles.boxes.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx="24"
                fill="none"
                stroke="var(--marigold)"
                strokeWidth="10"
              />
            ))}
          </svg>
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-background/90 p-3 backdrop-blur">
            <p lang="en" className="truncate text-sm font-semibold">
              {bangles.en.title}
            </p>
            <p lang="bn" className="truncate text-sm text-muted-foreground">
              {bangles.bn.title}
            </p>
          </div>
          <span className={`absolute top-3 left-3 inline-flex items-center gap-1 bg-black/60 text-white ${tag}`}>
            <ScanSearch className="size-3.5" aria-hidden="true" />
            {bangles.plan.sam_phrase}
          </span>
        </>
      ),
    },
    {
      key: "photos",
      media: (
        <>
          <Image
            src="/samples/bangles-studio.jpg"
            alt={t("outcomes.photos.alt")}
            fill
            sizes="(min-width: 768px) 320px, 80vw"
            className="object-cover"
          />
          <span className={`absolute right-3 bottom-3 bg-marigold-soft text-warning ${tag}`}>
            {tCommon("aiBackground")}
          </span>
        </>
      ),
    },
    {
      key: "draft",
      media: (
        <>
          <Image
            src="/samples/kurti-studio.jpg"
            alt={t("outcomes.draft.alt")}
            fill
            sizes="(min-width: 768px) 320px, 80vw"
            className="object-cover"
          />
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/90 p-3 backdrop-blur">
            <span className="text-sm font-medium">{t("outcomes.draft.storeDraft")}</span>
            <StatusBadge status="in_store" />
          </div>
          <span className={`absolute top-3 right-3 bg-black/60 text-white ${tag}`}>{t("outcomes.draft.post")}</span>
        </>
      ),
    },
  ] as const;

  return (
    <section aria-labelledby="outcomes-title" className="mx-auto max-w-5xl px-4 py-20 md:px-6 md:py-28">
      <h2 id="outcomes-title" className="sr-only">
        {t("outcomes.title")}
      </h2>
      <p className="mx-auto max-w-2xl text-center font-heading text-2xl leading-snug font-semibold text-balance md:text-3xl">
        {t("made")}
      </p>
      <ul
        // On a phone the cards scroll sideways, so the row itself must be reachable by keyboard
        tabIndex={0}
        aria-label={t("outcomes.title")}
        className="-mx-4 mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0"
      >
        {cards.map((card) => (
          <li key={card.key} className="w-[80%] shrink-0 snap-start md:w-auto">
            <div className="relative aspect-square overflow-hidden rounded-2xl border bg-white">{card.media}</div>
            <h3 className="mt-5 text-lg font-semibold">{t(`outcomes.${card.key}.title`)}</h3>
            <p className="mt-1.5 text-muted-foreground">{t(`outcomes.${card.key}.body`)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-center text-sm text-muted-foreground">{t("outcomes.also")}</p>
    </section>
  );
}
