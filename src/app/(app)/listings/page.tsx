import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Camera } from "lucide-react";
import { z } from "zod";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";
import { Pager } from "@/components/app/pager";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { LISTING_PAGE_SIZE } from "@/server/db/overview";
import { LISTING_VIEWS, ListingFilters, listingsHref } from "./_components/listing-filters";
import { ListingTable } from "./_components/listing-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("listings") };
}

// a bad or hand-edited query string falls back to the first page of everything
const Query = z.object({
  status: z.enum(LISTING_VIEWS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

/** S10 Listings: every listing in the shop, newest first, with status filters and search. */
export default async function ListingsPage({ searchParams }: PageProps<"/listings">) {
  const viewer = await requireWorkspace();
  const t = await getTranslations("listings");
  const tNav = await getTranslations("nav");
  const query = Query.parse(await searchParams);
  const filter = { status: query.status ?? null, q: query.q ?? "", page: query.page ?? 1 };
  const ws = forWorkspace(viewer.workspace.id);
  const archived = filter.status === "archived";
  const status = filter.status === "archived" ? null : filter.status;
  const [{ rows, total }, counts] = await Promise.all([
    ws.listingPage({ ...filter, status, archived }),
    ws.statusCounts(),
  ]);
  // "All" means every listing still in use; archived ones have their own chip
  const all = Object.entries(counts).reduce((n, [k, v]) => (k === "archived" ? n : n + v), 0);

  return (
    <>
      <TopBar
        title={tNav("listings")}
        actions={
          <ButtonLink href="/snap" className="max-md:hidden">
            <Camera />
            {tNav("newListing")}
          </ButtonLink>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
        {all === 0 && !counts.archived ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
            <Camera className="size-10 text-primary" aria-hidden="true" />
            <p className="max-w-sm text-muted-foreground">{t("empty")}</p>
            <ButtonLink href="/snap" size="lg">
              {t("snap")}
            </ButtonLink>
          </div>
        ) : (
          <>
            <ListingFilters status={filter.status} q={filter.q} counts={counts} all={all} />
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
                <p className="text-muted-foreground">{t("noMatch")}</p>
                <ButtonLink href="/listings" variant="outline">
                  {t("clear")}
                </ButtonLink>
              </div>
            ) : (
              <>
                <ListingTable rows={rows} rounding={viewer.workspace.settings.priceRounding} />
                <Pager
                  page={filter.page}
                  total={total}
                  size={LISTING_PAGE_SIZE}
                  href={(page) => listingsHref({ ...filter, page })}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
