/**
 * The title to show for a listing: the Bangla one when the app is in Bangla and the
 * listing has one, else the English one. `lang` goes on the element, so screen readers
 * and fonts treat Bangla text as Bangla.
 */
export function localTitle(
  row: { title: string | null; title_bn?: string | null },
  locale: string,
): { text: string | null; lang: "en" | "bn" } {
  if (locale === "bn" && row.title_bn) return { text: row.title_bn, lang: "bn" };
  return { text: row.title, lang: "en" };
}
