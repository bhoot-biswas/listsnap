import "server-only";
import { StepError } from "@/server/pipeline/run-step";
import type { StepErrorKey } from "@/server/step-text";

/**
 * A circuit breaker per outside service. When Meta is down, a bulk upload would otherwise
 * send every job's steps at it and burn all three attempts each within seconds. After a
 * few failures in a row the breaker opens: calls fail at once without leaving the server,
 * and their attempt is given back. After the cooldown one call goes through as a trial;
 * success closes the breaker, another failure reopens it. Only transient failures count
 * (429, 5xx, timeouts); a refused request is our bug, not an outage.
 *
 * In memory, per server process: one VPS runs one process, and a restart starting closed
 * is the right default.
 */

export const BREAKER_THRESHOLD = 3;
export const BREAKER_COOLDOWN_MS = 30_000;

type Service = "spark" | "image" | "sam";

const state = new Map<Service, { failures: number; openedAt: number | null }>();
const of = (s: Service) => state.get(s) ?? state.set(s, { failures: 0, openedAt: null }).get(s)!;

/** Throws when the service's breaker is open; lets one trial through after the cooldown. */
export function guard(service: Service, busy: StepErrorKey, now = Date.now()): void {
  const s = of(service);
  if (s.openedAt === null) return;
  if (now - s.openedAt < BREAKER_COOLDOWN_MS) throw new StepError(busy, { notAttempted: true });
  // half-open: this call is the trial; a failure reopens at once because failures stay high
  s.openedAt = null;
}

export function record(service: Service, ok: boolean, now = Date.now()): void {
  const s = of(service);
  if (ok) {
    s.failures = 0;
    return;
  }
  s.failures++;
  if (s.failures >= BREAKER_THRESHOLD && s.openedAt === null) {
    s.openedAt = now;
    console.warn(`[breaker] ${service} open after ${s.failures} failures in a row`);
  }
}

/**
 * Every Model API response carries the remaining budget (x-ratelimit-remaining-*). Logged
 * when it runs low, so a busy day shows up in the server log before the 429s do.
 */
export function noteRateLimit(service: Service, headers: Headers): void {
  for (const unit of ["requests", "tokens"] as const) {
    const left = Number(headers.get(`x-ratelimit-remaining-${unit}`));
    const limit = Number(headers.get(`x-ratelimit-limit-${unit}`));
    if (limit > 0 && Number.isFinite(left) && left < limit * 0.1)
      console.warn(`[rate-limit] ${service}: ${left} of ${limit} ${unit} left`);
  }
}

/** For tests. */
export const resetBreakers = () => state.clear();
