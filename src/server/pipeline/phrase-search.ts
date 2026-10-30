import "server-only";

/**
 * The planned phrase usually matches, so it runs alone. When it misses, the alternatives
 * run together rather than one by one: a miss then costs one extra round trip instead of
 * two, which keeps the segment step inside its lock. The earliest phrase in plan order
 * that found something wins, as the sequential search did.
 */
export async function searchPhrases<T>(
  phrases: string[],
  find: (phrase: string) => Promise<T[]>,
): Promise<{ phrase: string | null; found: T[]; tried: string[] }> {
  const [first, ...rest] = phrases;
  if (first === undefined) return { phrase: null, found: [], tried: [] };

  const firstFound = await find(first);
  if (firstFound.length) return { phrase: first, found: firstFound, tried: [first] };

  const results = await Promise.all(rest.map(find));
  const hit = results.findIndex((r) => r.length > 0);
  return hit === -1
    ? { phrase: null, found: [], tried: phrases }
    : { phrase: rest[hit]!, found: results[hit]!, tried: phrases };
}
