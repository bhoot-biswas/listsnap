import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonLink } from "./button-link";

/**
 * "21–40 of 57" with previous and next links (Listings, Media); hidden when everything
 * fits on one page. `href` builds a page's URL, keeping the page's own filters.
 */
export async function Pager({
  page,
  total,
  size,
  href,
}: {
  page: number;
  total: number;
  size: number;
  href: (page: number) => Route;
}) {
  const t = await getTranslations("common.pager");
  if (total <= size && page === 1) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <nav aria-label={t("pages")} className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">{t("range", { from, to, total })}</p>
      <div className="flex gap-2">
        {page > 1 && (
          <ButtonLink variant="outline" className="h-11 md:h-9" href={href(page - 1)}>
            <ChevronLeft />
            {t("previous")}
          </ButtonLink>
        )}
        {to < total && (
          <ButtonLink variant="outline" className="h-11 md:h-9" href={href(page + 1)}>
            {t("next")}
            <ChevronRight />
          </ButtonLink>
        )}
      </div>
    </nav>
  );
}
