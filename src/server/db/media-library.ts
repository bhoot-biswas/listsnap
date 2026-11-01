import "server-only";
import { select, selectOne } from "./pool";
import { LOOKS, lookKind } from "@/lib/schemas/looks";

/**
 * The Media library's queries, bound to one workspace. Spread into forWorkspace().
 * Only AI photos carry a listing_id; originals and cutouts reach their job through
 * photos and items, so each image is traced back to the job it came from.
 */

export const MEDIA_PAGE_SIZE = 48;

export const MEDIA_GROUPS = {
  originals: ["original"],
  cutouts: ["main", "cutout"],
  ai: ["studio", "lifestyle", "banner", ...LOOKS.map(lookKind)],
} as const;
export type MediaGroup = keyof typeof MEDIA_GROUPS;

const SHOWN = [...MEDIA_GROUPS.originals, ...MEDIA_GROUPS.cutouts, ...MEDIA_GROUPS.ai];

export interface MediaTile {
  id: string;
  kind: (typeof SHOWN)[number];
  mime: string;
  bytes: number;
  width: number;
  height: number;
  created_at: Date;
  job_id: string | null;
  listing_id: string | null;
  title: string | null;
  title_bn: string | null;
}

const TITLE = (alias: string, lang = "en") => `JSON_UNQUOTE(JSON_EXTRACT(${alias}.fields_json, '$.${lang}.title'))`;
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// the job comes from the listing (AI photos), the photo (originals) or the item (cutouts)
const TRACED = (kinds: readonly string[]) => `
  FROM media m
  LEFT JOIN listings l ON l.id = m.listing_id
  LEFT JOIN photos p ON p.media_id = m.id
  LEFT JOIN items im ON im.cutout_media_id = m.id
  LEFT JOIN photos pm ON pm.id = im.photo_id
  LEFT JOIN items ic ON ic.cutout_png_media_id = m.id
  LEFT JOIN photos pc ON pc.id = ic.photo_id
 WHERE m.workspace_id = ? AND m.kind IN (${kinds.map(() => "?").join(",")})`;

// an archived listing's or job's photos leave the library with it
const ARCHIVED_AT = `COALESCE(l.archived_at, (SELECT j.archived_at FROM jobs j
  WHERE j.id = COALESCE(l.job_id, p.job_id, pm.job_id, pc.job_id)))`;

export function mediaLibraryQueries(ws: string) {
  return {
    async mediaPage(opts: { group: MediaGroup | null; q: string; page: number }) {
      const kinds = opts.group ? MEDIA_GROUPS[opts.group] : SHOWN;
      const params: (string | number)[] = [ws, ...kinds];
      let filter = "WHERE t.archived_at IS NULL";
      if (opts.q) {
        filter += " AND (t.title COLLATE utf8mb4_unicode_ci LIKE ? OR t.title_bn COLLATE utf8mb4_unicode_ci LIKE ?)";
        params.push(likeTerm(opts.q), likeTerm(opts.q));
      }
      const base = `
        SELECT m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.created_at, m.listing_id,
               COALESCE(l.job_id, p.job_id, pm.job_id, pc.job_id) AS job_id,
               COALESCE(${TITLE("l")}, (SELECT ${TITLE("l2")} FROM listings l2
                  WHERE l2.job_id = COALESCE(p.job_id, pm.job_id, pc.job_id) ORDER BY l2.sort LIMIT 1)) AS title,
               COALESCE(${TITLE("l", "bn")}, (SELECT ${TITLE("l2", "bn")} FROM listings l2
                  WHERE l2.job_id = COALESCE(p.job_id, pm.job_id, pc.job_id) ORDER BY l2.sort LIMIT 1)) AS title_bn,
               ${ARCHIVED_AT} AS archived_at
          ${TRACED(kinds)}`;
      const [rows, total] = await Promise.all([
        select<MediaTile>(`SELECT * FROM (${base}) t ${filter} ORDER BY t.created_at DESC, t.id LIMIT ? OFFSET ?`, [
          ...params,
          MEDIA_PAGE_SIZE,
          (opts.page - 1) * MEDIA_PAGE_SIZE,
        ]),
        selectOne<{ n: number }>(`SELECT COUNT(*) AS n FROM (${base}) t ${filter}`, params),
      ]);
      return { rows, total: Number(total?.n ?? 0) };
    },

    /** Images per group and the bytes stored, for the chips and the storage line. */
    async mediaSummary(): Promise<{ counts: Record<MediaGroup, number>; bytes: number }> {
      const [shown, disk] = await Promise.all([
        // counted the way mediaPage finds them, so a chip never promises photos the grid hides
        select<{ kind: string; n: number }>(
          `SELECT t.kind, COUNT(*) AS n FROM (SELECT m.kind, ${ARCHIVED_AT} AS archived_at ${TRACED(SHOWN)}) t
            WHERE t.archived_at IS NULL GROUP BY t.kind`,
          [ws, ...SHOWN],
        ),
        // everything on disk counts, archived photos, masks and Instagram copies included
        selectOne<{ bytes: number | null }>("SELECT SUM(bytes) AS bytes FROM media WHERE workspace_id = ?", [ws]),
      ]);
      const count = (kinds: readonly string[]) =>
        shown.filter((r) => kinds.includes(r.kind)).reduce((a, r) => a + Number(r.n), 0);
      return {
        counts: {
          originals: count(MEDIA_GROUPS.originals),
          cutouts: count(MEDIA_GROUPS.cutouts),
          ai: count(MEDIA_GROUPS.ai),
        },
        bytes: Number(disk?.bytes ?? 0),
      };
    },
  };
}
