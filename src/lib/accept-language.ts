/**
 * The first of our languages a browser asks for, by its Accept-Language weights, or null.
 * "bn-BD,bn;q=0.9,en;q=0.8" gives "bn"; a header naming neither gives null.
 */
export function preferredLanguage<T extends string>(header: string | null, supported: readonly T[]): T | null {
  if (!header) return null;
  const asked = header
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const q = Number(
        params
          .find((p) => p.trim().startsWith("q="))
          ?.trim()
          .slice(2) ?? 1,
      );
      return { lang: tag.split("-")[0]!, q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((a) => a.q > 0)
    // equal weights keep the browser's own order
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return asked.map((a) => supported.find((s) => s === a.lang)).find((s) => s !== undefined) ?? null;
}
