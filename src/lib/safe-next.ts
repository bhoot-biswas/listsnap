/**
 * Where to go after signing in: a path on this site, with its query, or null. Anything
 * that could leave the site ("//evil.example", "/\evil.example", "https://…") is dropped,
 * and so is the sign-in page itself, which would only send the seller round again.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 2000) return null;
  const base = "http://listsnap.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base || url.pathname.startsWith("/sign-in")) return null;
  return url.pathname + url.search + url.hash;
}
