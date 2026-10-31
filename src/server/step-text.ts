import "server-only";
import { createTranslator } from "next-intl";
import { getLocale } from "next-intl/server";
import en from "../../messages/en.json";
import bn from "../../messages/bn.json";
import type { Locale } from "@/i18n/request";

/**
 * Words the server writes for sellers outside a page: step errors and the one line of what
 * the AI decided under each step. They are kept as a key and values, not as English, and
 * turned into the seller's language where they leave the server, so a Bangla UI shows
 * Bangla. The English is still what the server log and the chat model see.
 */

export type StepErrorKey = keyof (typeof en)["stepText"]["errors"];
export type ApiErrorKey = keyof (typeof en)["apiErrors"];
export type TextParams = Record<string, string | number>;

const translators = {
  en: createTranslator({ locale: "en", messages: en, timeZone: "Asia/Dhaka" }),
  bn: createTranslator({ locale: "bn", messages: bn, timeZone: "Asia/Dhaka" }),
};

/** A message from the messages files, in `locale`; keys are full paths ("stepText.errors.busy"). */
export function text(locale: Locale, key: string, params?: TextParams): string {
  // keys built at runtime can't be checked against the message types
  return (translators[locale] as (k: string, p?: TextParams) => string)(key, params);
}

/** The UI language of the request being served; English outside one (tests, scripts). */
export async function requestLocale(): Promise<Locale> {
  try {
    return (await getLocale()) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

/** A step error as job_steps.last_error keeps it: the key and values, never the words. */
export function storedError(key: StepErrorKey, params?: TextParams): string {
  // last_error is VARCHAR(500); a value quoted from a model or a store is the only long part
  const short = Object.fromEntries(
    Object.entries(params ?? {}).map(([k, v]) => [
      k,
      // another stored error inside (one store's failure among several) is already short
      typeof v === "string" && !parseStoredError(v) ? v.slice(0, 200) : v,
    ]),
  );
  return JSON.stringify(params ? { key, params: short } : { key });
}

/** The parts of a stored error, or null for one written as plain words before keys existed. */
export function parseStoredError(stored: string): { key: StepErrorKey; params?: TextParams } | null {
  if (!stored.startsWith("{")) return null;
  try {
    const v = JSON.parse(stored) as { key?: unknown; params?: TextParams };
    return typeof v.key === "string" && v.key in en.stepText.errors
      ? { key: v.key as StepErrorKey, params: v.params }
      : null;
  } catch {
    return null;
  }
}

/** A StepError's words in the seller's language, for errors that are answered at once rather than stored. */
export function errorWords(err: { key: StepErrorKey; params?: TextParams }, locale: Locale): string {
  const params =
    err.params &&
    Object.fromEntries(
      Object.entries(err.params).map(([k, v]) => [k, typeof v === "string" ? nestedText(v, locale) : v]),
    );
  return text(locale, `stepText.errors.${err.key}`, params);
}

const nestedText = (v: string, locale: Locale) => {
  const inner = parseStoredError(v);
  return inner ? errorWords(inner, locale) : v;
};

/** A stored step error in the seller's language; old plain-word errors are shown as they are. */
export function errorText(stored: string, locale: Locale): string {
  const parsed = parseStoredError(stored);
  return parsed ? errorWords(parsed, locale) : stored;
}
