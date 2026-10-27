import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/app/status-badge";
import type { RecentListingRow } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";

/** The last few listings beside the Snap form, so a seller can jump back to one. */
export async function RecentListings({ rows }: { rows: RecentListingRow[] }) {
  const t = await getTranslations("snap");
  const format = await getFormatter();
  return (
    <section aria-labelledby="recent-listings" className="space-y-3">
      <h2 id="recent-listings" className="text-base font-semibold">
        {t("recent")}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">{t("recentEmpty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/job/${r.job_id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/60">
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
