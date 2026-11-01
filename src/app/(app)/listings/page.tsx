import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Camera } from "lucide-react";
import { z } from "zod";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";
import { Pager } from "@/components/app/pager";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { LISTING_PAGE_SIZE, LISTING_SORTS } from "@/server/db/overview";
import { LISTING_VIEWS, ListingFilters, listingsHref } from "./_components/listing-filters";
import { ListingTable } from "./_components/listing-table";
import { ListingSelection } from "./_components/listing-selection";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("listings") };
}

// a bad or hand-edited query string falls back to the first page of everything
const Query = z.object({
  status: z.enum(LISTING_VIEWS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  sort: z.enum(LISTING_SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

/** S10 Listings: every listing in the shop, with status filters, search and a choice of order. */
export default async function ListingsPage({ searchParams }: PageProps<"/listings">) {
  const viewer = await requireWorkspace();
  const t = await getTranslations("listings");
  const tNav = await getTranslations("nav");
  const query = Query.parse(await searchParams);
  const filter = {
    status: query.status ?? null,
    q: query.q ?? "",
    sort: query.sort ?? "newest",
    page: query.page ?? 1,
  };
  const ws = forWorkspace(viewer.workspace.id);
  const archived = filter.status === "archived";
  const behind = filter.status === "behind";
  const status = filter.status === "archived" || filter.status === "behind" ? null : filter.status;
  const [{ rows, total }, counts, shop] = await Promise.all([
    ws.listingPage({ ...filter, status, archived, behind }),
    ws.statusCounts(filter.q),
    // the counts follow the search, so whether the shop has listings at all is asked apart
    filter.q ? ws.statusCounts() : null,
  ]);
  // "All" means every listing still in use; archived ones have their own chip, and
  // listings with an out-of-date store draft are already counted under their status
  const inUse = (c: typeof counts) =>
    Object.entries(c).reduce((n, [k, v]) => (k === "archived" || k === "behind" ? n : n + v), 0);
  const all = inUse(counts);
  const empty = !inUse(shop ?? counts) && !(shop ?? counts).archived;

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
        {empty ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
            <Camera className="size-10 text-primary" aria-hidden="true" />
            <p className="max-w-sm text-muted-foreground">{t("empty")}</p>
            <ButtonLink href="/snap" size="lg">
              {t("snap")}
            </ButtonLink>
          </div>
        ) : (
          <>
            <ListingFilters status={filter.status} q={filter.q} sort={filter.sort} counts={counts} all={all} />
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
                <p className="text-muted-foreground">{t("noMatch")}</p>
                <ButtonLink href="/listings" variant="outline">
                  {t("clear")}
                </ButtonLink>
              </div>
            ) : (
              <>
                <ListingSelection
                  key={listingsHref(filter)}
                  rows={rows.map((r) => ({ id: r.id, jobId: r.job_id, status: r.status }))}
                  archived={archived}
                >
                  <ListingTable rows={rows} rounding={viewer.workspace.settings.priceRounding} archived={archived} />
                </ListingSelection>
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
