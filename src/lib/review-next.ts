/** A listing still to save: checked or not, it isn't in the store yet. */
const UNSAVED = new Set(["needs_review", "ready"]);

/**
 * The listing to review after this one: the next one from the same photo, in order and
 * wrapping round, that isn't in the store yet. Null when every other one is saved.
 */
export function nextListing<T extends { id: string; status: string }>(
  listings: T[],
  currentId: string | null,
): T | null {
  const at = currentId ? listings.findIndex((l) => l.id === currentId) : -1;
  for (let i = 1; i <= listings.length; i++) {
    const l = listings[(at + i + listings.length) % listings.length]!;
    if (l.id !== currentId && UNSAVED.has(l.status)) return l;
  }
  return null;
}

/** What Review lists: listings that are written, whatever the store has. */
export const REVIEWABLE = new Set(["needs_review", "ready", "in_store", "posted"]);

/**
 * Three of the same product in different colours can share a title, so where a title
 * repeats it gets the listing's number in front, which a cut-short tab still shows.
 * `n` is the place in Review's tabs.
 */
export function numberRepeats<T extends { title: string | null }>(
  listings: T[],
  numbered: (title: string, n: number) => string,
): (T & { n: number })[] {
  return listings.map((l, i) => ({
    ...l,
    n: i + 1,
    title: l.title && listings.filter((x) => x.title === l.title).length > 1 ? numbered(l.title, i + 1) : l.title,
  }));
}
