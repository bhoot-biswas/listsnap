import "server-only";
import { selectOne } from "./pool";

/**
 * The database half of GET /api/health: can we query, and which migration ran last.
 * Not workspace-scoped on purpose; it reads no shop's data.
 */
export async function databaseHealth(): Promise<{ ok: boolean; migration: string | null }> {
  try {
    const row = await selectOne<{ name: string }>("SELECT name FROM listsnap_migrations ORDER BY name DESC LIMIT 1");
    return { ok: true, migration: row?.name ?? null };
  } catch {
    return { ok: false, migration: null };
  }
}
