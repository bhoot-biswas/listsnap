import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Images, Search } from "lucide-react";
import { z } from "zod";
import { Pager } from "@/components/app/pager";
import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireWorkspace } from "@/server/auth/session";
import { MEDIA_PAGE_SIZE } from "@/server/db/media-library";
import { forWorkspace, type MediaGroup } from "@/server/db/scope";
import { cn } from "@/lib/utils";
import { MediaGrid } from "./_components/media-grid";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("media") };
}

const GROUPS = ["originals", "cutouts", "ai"] as const;

const Query = z.object({
  type: z.enum(GROUPS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

function mediaHref(p: { group: MediaGroup | null; q: string; page?: number }) {
  const s = new URLSearchParams();
  if (p.group) s.set("type", p.group);
  if (p.q) s.set("q", p.q);
  if (p.page && p.page > 1) s.set("page", String(p.page));
  const qs = s.toString();
  return qs ? (`/media?${qs}` as const) : ("/media" as const);
}

/** S12 Media library: every photo the shop has, the seller's own and the ones ListSnap made. */
export default async function MediaPage({ searchParams }: PageProps<"/media">) {
  const viewer = await requireWorkspace();
  const t = await getTranslations("media");
  const tNav = await getTranslations("nav");
  const format = await getFormatter();
  const query = Query.parse(await searchParams);
  const filter = { group: query.type ?? null, q: query.q ?? "", page: query.page ?? 1 };
  const ws = forWorkspace(viewer.workspace.id);
  const [{ rows, total }, summary] = await Promise.all([ws.mediaPage(filter), ws.mediaSummary()]);
  const all = summary.counts.originals + summary.counts.cutouts + summary.counts.ai;

  const chip = (group: MediaGroup | null, label: string, n: number) => (
    <li key={group ?? "all"}>
      <Link
        href={mediaHref({ group, q: filter.q })}
        aria-current={filter.group === group ? "page" : undefined}
        className={cn(
          "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap md:h-9",
          filter.group === group ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
        )}
      >
        {label}
        <span className={cn("tabular-nums", filter.group === group ? "opacity-80" : "text-muted-foreground")}>
          {format.number(n)}
        </span>
      </Link>
    </li>
  );

  return (
    <>
      <TopBar title={tNav("media")} />
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
        {all === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
            <Images className="size-10 text-primary" aria-hidden="true" />
            <p className="max-w-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("storage", { size: format.number(summary.bytes / 1024 / 1024, { maximumFractionDigits: 1 }) })}
            </p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <nav aria-label={t("filters")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <ul className="flex gap-2">
                  {chip(null, t("all"), all)}
                  {GROUPS.map((g) => chip(g, t(`groups.${g}`), summary.counts[g]))}
                </ul>
              </nav>
              <form role="search" action="/media" className="flex gap-2 lg:w-80">
                {filter.group && <input type="hidden" name="type" value={filter.group} />}
                <Input
                  type="search"
                  name="q"
                  defaultValue={filter.q}
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
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
                {t("noMatch")}
              </p>
            ) : (
              <>
                <MediaGrid tiles={rows} />
                <Pager
                  page={filter.page}
                  total={total}
                  size={MEDIA_PAGE_SIZE}
                  href={(page) => mediaHref({ ...filter, page })}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
