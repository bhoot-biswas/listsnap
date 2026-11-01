import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { preferredLanguage } from "@/lib/accept-language";
import { getSession } from "@/server/auth/session";

export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "listsnap_lang";

const isLocale = (v: string | null | undefined): v is Locale => !!v && (LOCALES as readonly string[]).includes(v);

/**
 * next-intl without locale routing: the UI language is never part of the URL. This
 * browser's own choice (the cookie from the language switch) comes first; then the
 * language saved on the profile, so it follows the seller to a new phone; then what the
 * browser asks for, so a Bangla phone opens in Bangla; then English.
 */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = "en";
  if (isLocale(fromCookie)) locale = fromCookie;
  else {
    // only without the cookie, so most requests never ask for the session here
    const session = await getSession().catch(() => null);
    const saved = (session?.user as { uiLang?: string | null } | undefined)?.uiLang;
    locale = isLocale(saved) ? saved : (preferredLanguage((await headers()).get("accept-language"), LOCALES) ?? "en");
  }
  // sellers are in Bangladesh; without this, times follow the server's zone (UTC when hosted)
  return { locale, timeZone: "Asia/Dhaka", messages: (await import(`../../messages/${locale}.json`)).default };
});
