import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import type { DashboardStats } from "@/server/db/scope";

function Tile({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  href?: "/listings?status=needs_review";
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="group relative rounded-xl border bg-card p-4 hover:bg-muted/50">
      {body}
      <ChevronRight
        className="absolute top-4 right-3 size-4 text-muted-foreground group-hover:text-foreground"
        aria-hidden="true"
      />
    </Link>
  ) : (
    <div className="rounded-xl border bg-card p-4">{body}</div>
  );
}

/** Four numbers for the day: small trend text only, no charts. */
export async function StatTiles({ stats }: { stats: DashboardStats }) {
  const t = await getTranslations("dashboard.stats");
  const format = await getFormatter();
  const diff = stats.listedToday - stats.listedYesterday;
  return (
    <section aria-label={t("label")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label={t("listedToday")}
        value={format.number(stats.listedToday)}
        note={
          diff === 0 ? t("sameAsYesterday") : t("vsYesterday", { diff: format.number(diff, { signDisplay: "always" }) })
        }
      />
      <Tile
        label={t("waiting")}
        value={format.number(stats.waiting)}
        note={t("waitingNote")}
        href="/listings?status=needs_review"
      />
      <Tile label={t("inStoreWeek")} value={format.number(stats.inStoreWeek)} note={t("asDrafts")} />
      <Tile
        label={t("avgTime")}
        value={stats.avgSeconds == null ? "–" : t("seconds", { s: format.number(stats.avgSeconds) })}
        note={t("costToday", { cost: format.number(stats.costToday, { style: "currency", currency: "USD" }) })}
      />
    </section>
  );
}
