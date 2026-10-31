import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const LISTING_STATUSES = ["processing", "needs_review", "ready", "in_store", "posted", "failed"] as const;
/** What a chip can show: a status, or the archived listings, which no other chip includes. */
export const LISTING_VIEWS = [...LISTING_STATUSES, "archived"] as const;
export type ListingView = (typeof LISTING_VIEWS)[number];

/** Builds a Listings URL; filters and search live in the query string, so they survive reloads and sharing. */
export function listingsHref(p: { status?: ListingView | null; q?: string; page?: number }) {
  const s = new URLSearchParams();
  if (p.status) s.set("status", p.status);
  if (p.q) s.set("q", p.q);
  if (p.page && p.page > 1) s.set("page", String(p.page));
  const qs = s.toString();
  return qs ? (`/listings?${qs}` as const) : ("/listings" as const);
}

/**
 * Status chips with counts, and a plain GET search form: both work without JavaScript.
 * Processing, Failed and Archived only show while something is in them.
 */
export async function ListingFilters({
  status,
  q,
  counts,
  all,
}: {
  status: ListingView | null;
  q: string;
  counts: Partial<Record<ListingView, number>>;
  all: number;
}) {
  const t = await getTranslations("listings");
  const tStatus = await getTranslations("status");
  const chips = LISTING_STATUSES.filter((s) => !(s === "processing" || s === "failed") || counts[s] || s === status);
  const chip = (key: ListingView | null, label: string, n: number) => (
    <li key={key ?? "all"}>
      <Link
        href={listingsHref({ status: key, q })}
        aria-current={status === key ? "page" : undefined}
        className={cn(
          "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap md:h-9",
          status === key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
        )}
      >
        {label}
        <span className={cn("tabular-nums", status === key ? "opacity-80" : "text-muted-foreground")}>{n}</span>
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label={t("filters")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2">
          {chip(null, t("all"), all)}
          {chips.map((s) => chip(s, tStatus(s), counts[s] ?? 0))}
          {(counts.archived || status === "archived") && chip("archived", t("archived"), counts.archived ?? 0)}
        </ul>
      </nav>
      <form role="search" action="/listings" className="flex gap-2 lg:w-80">
        {status && <input type="hidden" name="status" value={status} />}
        <Input
          type="search"
          name="q"
          defaultValue={q}
          aria-label={t("search")}
          placeholder={t("search")}
          maxLength={100}
          className="h-11 md:h-9"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 md:size-9"
          aria-label={t("searchGo")}
        >
          <Search />
        </Button>
      </form>
    </div>
  );
}
