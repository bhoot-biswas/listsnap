import "server-only";
import type { StepOutcome } from "@/server/pipeline/run-step";
import { errorText, requestLocale, text, type ApiErrorKey, type TextParams } from "@/server/step-text";

/** Small JSON helpers so every route answers errors the same way: { error: { code, message } }. */

export const ok = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** An error whose words are already in the seller's language. */
export const failWords = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * An error from `apiErrors` in the messages files. Pages show the message as it comes, so it
 * is put in the request's UI language here; the code is the same in every language.
 */
export const fail = async (status: number, code: string, key: ApiErrorKey, params?: TextParams) =>
  failWords(status, code, text(await requestLocale(), `apiErrors.${key}`, params));

export const unauthorized = () => fail(401, "unauthorized", "signInAgain");
export const notFound = () => fail(404, "not_found", "notInShop");

/**
 * A step's outcome as HTTP: 200 done, 202 running (call again in a moment), 422 failed.
 * The runner retries a failure while attempts are left; an exhausted one shows "Try again".
 */
export async function stepResponse(outcome: StepOutcome<unknown>): Promise<Response> {
  if (outcome.state === "done") return ok({ state: "done", fresh: outcome.fresh });
  if (outcome.state === "running") return ok({ state: "running", retryAfterMs: 1500 }, 202);
  const error = errorText(outcome.error, await requestLocale());
  return ok({ state: "failed", error, attempts: outcome.attempts, exhausted: outcome.exhausted }, 422);
}
