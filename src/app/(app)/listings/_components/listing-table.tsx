import Image from "next/image";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, RefreshCw } from "lucide-react";
import { ArchiveButton } from "@/components/app/archive-button";
import { ConfidenceDots } from "@/components/app/confidence-dots";
import { StatusBadge } from "@/components/app/status-badge";
import { listingHref } from "@/lib/listing-links";
import { localTitle } from "@/lib/titles";
import { sized } from "@/lib/media-size";
import { suggestedPrice } from "@/lib/schemas/review";
import { STORE_NAMES } from "@/lib/stores";
import type { ListingListRow } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { SelectAllBox, SelectBox } from "./listing-selection";

function Thumb({ mediaId, size }: { mediaId: string | null; size: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-md border bg-white" style={{ width: size, height: size }}>
      {mediaId && (
        <Image
          src={sized(mediaUrl(mediaId), size <= 48 ? 96 : 320)}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-contain"
          unoptimized
        />
      )}
    </div>
  );
}

/**
 * The listings as a table on desktop and as cards on phones. Both come from the same
 * rows; CSS picks one, so there is no layout jump. Only the tick boxes are client code.
 * Archived listings get their own Restore.
 */
export async function ListingTable({
  rows,
  rounding,
  archived,
}: {
  rows: ListingListRow[];
  rounding: number;
  archived: boolean;
}) {
  const t = await getTranslations("listings");
  const format = await getFormatter();
  const locale = await getLocale();
  const view = rows.map((r) => {
    const suggested =
      r.price_bdt == null && r.hint_low != null && r.hint_high != null
        ? suggestedPrice({ low: r.hint_low, high: r.hint_high }, rounding)
        : null;
    const price = r.price_bdt ?? suggested;
    return {
      ...r,
      href: listingHref(r),
      title: localTitle(r, locale).text ?? t("untitled"),
      lang: localTitle(r, locale).lang,
      // the model's guess is only a starting point; it mustn't read like a price the seller set
      price:
        price == null ? (
          "–"
        ) : suggested != null ? (
          <span className="text-muted-foreground" title={t("suggestedHint")}>
            ~৳{format.number(price)}
            <span className="sr-only"> ({t("suggested")})</span>
          </span>
        ) : (
          `৳${format.number(price)}`
        ),
      created: relativeTime(format, r.created_at),
    };
  });
  const store = (r: (typeof view)[number], align: "start" | "end") =>
    (r.stores.length > 0 || r.behind || r.marketplace) && (
      <span className={cn("flex flex-col gap-0.5 text-xs", align === "end" ? "items-end" : "items-start")}>
        {r.stores.length > 0 && (
          <span className="text-muted-foreground">
            <span className="sr-only">{t("storesIn")} </span>
            {r.stores.map((k) => STORE_NAMES[k]).join(" · ")}
          </span>
        )}
        {r.marketplace && <span className="text-muted-foreground">{t("onMarketplace")}</span>}
        {r.behind && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-warning">
            <RefreshCw className="size-3" aria-hidden="true" />
            {t("behindShort")}
          </span>
        )}
      </span>
    );

  return (
    <>
      <div className="md:hidden">
        <SelectAllBox withText />
      </div>
      <ul className="divide-y rounded-xl border bg-card md:hidden">
        {view.map((r) => (
          <li key={r.id} className="flex items-center pl-1">
            <SelectBox id={r.id} label={t("selectRow", { title: r.title })} />
            <Link
              href={r.href}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 pl-1 hover:bg-muted/60"
            >
              <Thumb mediaId={r.cutout_media_id} size={52} />
              <div className="min-w-0 flex-1 space-y-1">
                <p lang={r.lang} className="truncate text-sm font-medium">
                  {r.title}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs whitespace-nowrap text-muted-foreground">
                  <span className="tabular-nums">{r.price}</span>
                  {r.colors > 1 && <span>· {t("colors", { count: r.colors })}</span>}
                  <span>· {r.created}</span>
                </p>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={r.status} />
                {store(r, "end")}
              </span>
            </Link>
            {archived && <ArchiveButton kind="listing" id={r.id} archived className="mr-2 h-11 px-3" />}
          </li>
        ))}
      </ul>

      <div className="relative overflow-x-auto rounded-xl border bg-card max-md:hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-12 pl-1">
                <SelectAllBox />
              </th>
              <th scope="col" className="w-16 px-3 py-2.5">
                <span className="sr-only">{t("photo")}</span>
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t("product")}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {t("price")}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium max-lg:hidden">
                {t("category")}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t("status")}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium max-lg:hidden">
                {t("confidence")}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t("created")}
              </th>
              <th scope="col" className="w-10 px-3 py-2.5">
                <span className="sr-only">{t("open")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {view.map((r) => (
              <tr key={r.id} className="relative hover:bg-muted/50">
                <td className="pl-1">
                  <SelectBox id={r.id} label={t("selectRow", { title: r.title })} />
                </td>
                <td className="px-3 py-2">
                  <Thumb mediaId={r.cutout_media_id} size={44} />
                </td>
                <td className="max-w-72 px-3 py-2">
                  {/* the title link covers the row, so the whole row opens the listing */}
                  <Link href={r.href} lang={r.lang} className="block truncate font-medium after:absolute after:inset-0">
                    {r.title}
                  </Link>
                  {r.colors > 1 && <p className="text-xs text-muted-foreground">{t("colors", { count: r.colors })}</p>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.price}</td>
                <td className="max-w-40 truncate px-3 py-2 text-muted-foreground max-lg:hidden">{r.category ?? "–"}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-col items-start gap-1">
                    <StatusBadge status={r.status} />
                    {store(r, "start")}
                    {/* here rather than a column of its own, so the table still fits beside the sidebar */}
                    {archived && <ArchiveButton kind="listing" id={r.id} archived className="relative z-10 h-9" />}
                  </span>
                </td>
                <td className="px-3 py-2 max-lg:hidden">
                  {r.confidence != null ? <ConfidenceDots confidence={r.confidence} /> : "–"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.created}</td>
                <td className="px-3 py-2">
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
