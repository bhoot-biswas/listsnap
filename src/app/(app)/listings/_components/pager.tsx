import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import type { ListingStatus } from "@/server/db/scope";
import { listingsHref } from "./listing-filters";

/** "21–40 of 57" with previous and next links; hidden when everything fits on one page. */
export async function Pager({
  status,
  q,
  page,
  total,
  size,
}: {
  status: ListingStatus | null;
  q: string;
  page: number;
  total: number;
  size: number;
}) {
  const t = await getTranslations("listings");
  if (total <= size && page === 1) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <nav aria-label={t("pages")} className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">{t("range", { from, to, total })}</p>
      <div className="flex gap-2">
        {page > 1 && (
          <ButtonLink variant="outline" className="h-11 md:h-9" href={listingsHref({ status, q, page: page - 1 })}>
            <ChevronLeft />
            {t("previous")}
          </ButtonLink>
        )}
        {to < total && (
          <ButtonLink variant="outline" className="h-11 md:h-9" href={listingsHref({ status, q, page: page + 1 })}>
            {t("next")}
            <ChevronRight />
          </ButtonLink>
        )}
      </div>
    </nav>
  );
}
