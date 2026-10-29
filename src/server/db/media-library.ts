import "server-only";
import { select, selectOne } from "./pool";

/**
 * The Media library's queries, bound to one workspace. Spread into forWorkspace().
 * Only AI photos carry a listing_id; originals and cutouts reach their job through
 * photos and items, so each image is traced back to the job it came from.
 */

export const MEDIA_PAGE_SIZE = 48;

export const MEDIA_GROUPS = {
  originals: ["original"],
  cutouts: ["main", "cutout"],
  ai: ["studio", "lifestyle", "banner"],
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
}

const TITLE = (alias: string) => `JSON_UNQUOTE(JSON_EXTRACT(${alias}.fields_json, '$.en.title'))`;
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function mediaLibraryQueries(ws: string) {
  return {
    async mediaPage(opts: { group: MediaGroup | null; q: string; page: number }) {
      const kinds = opts.group ? MEDIA_GROUPS[opts.group] : SHOWN;
      const params: (string | number)[] = [ws, ...kinds];
      let filter = "";
      if (opts.q) {
        filter = "WHERE t.title COLLATE utf8mb4_unicode_ci LIKE ?";
        params.push(likeTerm(opts.q));
      }
      // the job comes from the listing (AI photos), the photo (originals) or the item (cutouts)
      const base = `
        SELECT m.id, m.kind, m.mime, m.bytes, m.width, m.height, m.created_at, m.listing_id,
               COALESCE(l.job_id, p.job_id, pm.job_id, pc.job_id) AS job_id,
               COALESCE(${TITLE("l")}, (SELECT ${TITLE("l2")} FROM listings l2
                  WHERE l2.job_id = COALESCE(p.job_id, pm.job_id, pc.job_id) ORDER BY l2.sort LIMIT 1)) AS title
          FROM media m
          LEFT JOIN listings l ON l.id = m.listing_id
          LEFT JOIN photos p ON p.media_id = m.id
          LEFT JOIN items im ON im.cutout_media_id = m.id
          LEFT JOIN photos pm ON pm.id = im.photo_id
          LEFT JOIN items ic ON ic.cutout_png_media_id = m.id
          LEFT JOIN photos pc ON pc.id = ic.photo_id
         WHERE m.workspace_id = ? AND m.kind IN (${kinds.map(() => "?").join(",")})`;
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
      const rows = await select<{ kind: string; n: number; bytes: number }>(
        "SELECT kind, COUNT(*) AS n, SUM(bytes) AS bytes FROM media WHERE workspace_id = ? GROUP BY kind",
        [ws],
      );
      const count = (kinds: readonly string[]) =>
        rows.filter((r) => kinds.includes(r.kind)).reduce((a, r) => a + Number(r.n), 0);
      return {
        counts: {
          originals: count(MEDIA_GROUPS.originals),
          cutouts: count(MEDIA_GROUPS.cutouts),
          ai: count(MEDIA_GROUPS.ai),
        },
        // everything on disk counts, masks and Instagram copies included
        bytes: rows.reduce((a, r) => a + Number(r.bytes), 0),
      };
    },
  };
}
