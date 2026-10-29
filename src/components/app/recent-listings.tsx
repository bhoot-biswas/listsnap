import Image from "next/image";
import Link from "next/link";
import { getFormatter } from "next-intl/server";
import { StatusBadge } from "@/components/app/status-badge";
import { listingHref } from "@/lib/listing-links";
import type { RecentListingRow } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";

/** The last few listings (beside Snap, on the Dashboard), so a seller can jump back to one. */
export async function RecentListings({
  rows,
  heading,
  empty,
  action,
}: {
  rows: RecentListingRow[];
  heading: string;
  empty: string;
  /** A link beside the heading, such as "All listings". */
  action?: React.ReactNode;
}) {
  const format = await getFormatter();
  return (
    <section aria-labelledby="recent-listings" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-listings" className="text-base font-semibold">
          {heading}
        </h2>
        {action}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={listingHref(r)} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/60">
                <div className="relative size-11 shrink-0 overflow-hidden rounded-md border bg-white">
                  {r.cutout_media_id && (
                    <Image
                      src={mediaUrl(r.cutout_media_id)}
                      alt=""
                      fill
                      sizes="44px"
                      className="object-contain"
                      unoptimized
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title ?? "…"}</p>
                  <p className="text-xs text-muted-foreground">{format.relativeTime(r.updated_at)}</p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
