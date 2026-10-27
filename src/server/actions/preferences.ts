"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/i18n/request";
import { getAuth } from "@/server/auth/auth";
import { optionalViewer } from "@/server/auth/session";
import { headers } from "next/headers";

const Lang = z.enum(["en", "bn"]);

/**
 * The UI language: a cookie for this browser, and the profile when signed in so it
 * follows the person to other devices. Signed-out visitors (sign-in page) can switch too.
 */
export async function setUiLanguage(lang: string): Promise<void> {
  const parsed = Lang.safeParse(lang);
  if (!parsed.success) return;
  (await cookies()).set(LOCALE_COOKIE, parsed.data, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const viewer = await optionalViewer();
  if (viewer && !viewer.user.isDemo) {
    await getAuth().api.updateUser({ headers: await headers(), body: { uiLang: parsed.data } });
  }
}
