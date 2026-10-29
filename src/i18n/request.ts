import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "listsnap_lang";

const isLocale = (v: string | undefined): v is Locale => !!v && (LOCALES as readonly string[]).includes(v);

/**
 * next-intl without locale routing: the UI language is a cookie,
 * set from the language switch and from the profile, never part of the URL.
 */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(fromCookie) ? fromCookie : "en";
  // sellers are in Bangladesh; without this, times follow the server's zone (UTC when hosted)
  return { locale, timeZone: "Asia/Dhaka", messages: (await import(`../../messages/${locale}.json`)).default };
});
