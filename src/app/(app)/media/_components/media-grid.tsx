import Image from "next/image";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Download, ExternalLink } from "lucide-react";
import type { MediaTile } from "@/server/db/scope";
import { mediaUrl } from "@/server/media/store";
import { localTitle } from "@/lib/titles";
import { cn } from "@/lib/utils";
import { LOOKS, lookKind } from "@/lib/schemas/looks";

const AI_KINDS = new Set(["studio", "lifestyle", "banner", ...LOOKS.map(lookKind)]);

/**
 * The photos as tiles: the picture opens full size in a new tab, with its type, size
 * and listing below, and a download link. Cutouts sit on a checkerboard so their
 * transparent edges show.
 */
export async function MediaGrid({ tiles }: { tiles: MediaTile[] }) {
  const t = await getTranslations("media");
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((m) => {
        const url = mediaUrl(m.id);
        const title = localTitle(m, locale);
        const ext = m.mime === "image/png" ? "png" : "jpg";
        const kb = format.number(m.bytes / 1024, { maximumFractionDigits: 0 });
        return (
          <li key={m.id} className="overflow-hidden rounded-xl border bg-card">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={t("open", { kind: t(`kinds.${m.kind}`), title: title.text ?? t("untitled") })}
              className={cn(
                "relative block aspect-square",
                m.kind === "cutout"
                  ? "bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
                  : "bg-white",
              )}
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-contain"
                unoptimized
              />
              <span
                className={cn(
                  "absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium",
                  AI_KINDS.has(m.kind) ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground",
                )}
              >
                {t(`kinds.${m.kind}`)}
              </span>
            </a>
            <div className="space-y-1 p-3">
              {m.job_id ? (
                <Link
                  href={m.listing_id ? `/job/${m.job_id}/review?l=${m.listing_id}` : `/job/${m.job_id}`}
                  lang={title.lang}
                  className="line-clamp-1 text-sm font-medium hover:underline"
                >
                  {title.text ?? t("untitled")}
                </Link>
              ) : (
                <p className="line-clamp-1 text-sm text-muted-foreground">{t("untitled")}</p>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  {format.number(m.width)}×{format.number(m.height)} · {t("kb", { kb })}
                </p>
                <div className="-mr-2 flex">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("openFull")}
                    className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:size-8"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                  <a
                    href={url}
                    download={`listsnap-${m.kind}-${m.id.slice(0, 8)}.${ext}`}
                    aria-label={t("download")}
                    className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:size-8"
                  >
                    <Download className="size-4" />
                  </a>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
