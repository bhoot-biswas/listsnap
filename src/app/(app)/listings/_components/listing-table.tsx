import Image from "next/image";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { ConfidenceDots } from "@/components/app/confidence-dots";
import { StatusBadge } from "@/components/app/status-badge";
import { listingHref } from "@/lib/listing-links";
import { localTitle } from "@/lib/titles";
import { sized } from "@/lib/media-size";
import { suggestedPrice } from "@/lib/schemas/review";
import type { ListingListRow } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";

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
 * rows; CSS picks one, so there is no client code and no layout jump.
 */
export async function ListingTable({ rows, rounding }: { rows: ListingListRow[]; rounding: number }) {
  const t = await getTranslations("listings");
  const format = await getFormatter();
  const locale = await getLocale();
  const view = rows.map((r) => {
    const price =
      r.price_bdt ??
      (r.hint_low != null && r.hint_high != null
        ? suggestedPrice({ low: r.hint_low, high: r.hint_high }, rounding)
        : null);
    return {
      ...r,
      href: listingHref(r),
      title: localTitle(r, locale).text ?? t("untitled"),
      lang: localTitle(r, locale).lang,
      price: price == null ? "–" : `৳${format.number(price)}`,
      created: format.relativeTime(r.created_at),
    };
  });

  return (
    <>
      <ul className="divide-y rounded-xl border bg-card md:hidden">
        {view.map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="flex min-h-16 items-center gap-3 px-3 py-2.5 hover:bg-muted/60">
              <Thumb mediaId={r.cutout_media_id} size={52} />
              <div className="min-w-0 flex-1 space-y-1">
                <p lang={r.lang} className="truncate text-sm font-medium">
                  {r.title}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{r.price}</span>
                  {r.colors > 1 && <span>· {t("colors", { count: r.colors })}</span>}
                  <span>· {r.created}</span>
                </p>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          </li>
        ))}
      </ul>

      <div className="relative overflow-x-auto rounded-xl border bg-card max-md:hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
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
                <td className="px-3 py-2">
                  <Thumb mediaId={r.cutout_media_id} size={44} />
                </td>
                <td className="max-w-80 px-3 py-2">
                  {/* the title link covers the row, so the whole row opens the listing */}
                  <Link href={r.href} lang={r.lang} className="block truncate font-medium after:absolute after:inset-0">
                    {r.title}
                  </Link>
                  {r.colors > 1 && <p className="text-xs text-muted-foreground">{t("colors", { count: r.colors })}</p>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.price}</td>
                <td className="max-w-40 truncate px-3 py-2 text-muted-foreground max-lg:hidden">{r.category ?? "–"}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
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
