export type SaveOne = (listingId: string) => Promise<{ ok: true } | { ok: false; message: string | null }>;

export interface SaveAllResult {
  saved: string[];
  failed: { id: string; message: string | null }[];
}

/**
 * Saves listings to the store one after another. A failure doesn't stop the rest: each
 * listing is its own store draft, so one the store refused says nothing about the next.
 * `onProgress` hears how many are finished, saved or not, for "Saving 2 of 5".
 */
export async function saveAll(
  listingIds: string[],
  saveOne: SaveOne,
  onProgress: (finished: number) => void = () => {},
): Promise<SaveAllResult> {
  const result: SaveAllResult = { saved: [], failed: [] };
  for (const [i, id] of listingIds.entries()) {
    const r = await saveOne(id).catch(() => ({ ok: false as const, message: null }));
    if (r.ok) result.saved.push(id);
    else result.failed.push({ id, message: r.message });
    onProgress(i + 1);
  }
  return result;
}
