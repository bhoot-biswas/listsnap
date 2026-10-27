/**
 * The step rules every pipeline step follows. Pure: no HTTP, no SQL. The
 * store does the atomic parts; Route Handlers today and a background runner later
 * call the same function.
 *
 * 1. States are pending | running | done | failed, with a lock, attempts and last error.
 * 2. A done step returns its saved result without doing the work again.
 * 3. Work starts only after an atomic claim; a held lock answers "running".
 * 4. An expired lock or a failure can be claimed again, up to maxAttempts; then the
 *    step stays failed until someone presses "Try again" (force).
 */

export interface StepKey {
  jobId: string;
  step: string;
  target: string;
}

export interface StepRow {
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  lastError: string | null;
  result: unknown;
  /** Computed by the store against its own clock (the database's, in production). */
  lockValid: boolean;
}

export interface StepStore {
  /** Creates the row as pending if it doesn't exist. */
  ensure(key: StepKey): Promise<void>;
  get(key: StepKey): Promise<StepRow | null>;
  /**
   * Atomically moves the row to running with a fresh lock and attempts + 1, but only if
   * it is pending, failed, or running with an expired lock, and attempts < maxAttempts.
   * Returns whether this caller won.
   */
  claim(key: StepKey, lockMs: number, maxAttempts: number): Promise<boolean>;
  complete(key: StepKey, result: unknown): Promise<void>;
  fail(key: StepKey, error: string): Promise<void>;
  /** "Try again": a failed row goes back to pending with zero attempts. */
  reset(key: StepKey): Promise<void>;
}

export type StepOutcome<T> =
  | { state: "done"; result: T; fresh: boolean }
  | { state: "running" }
  | { state: "failed"; error: string; attempts: number; exhausted: boolean };

export interface RunOptions {
  lockMs: number;
  maxAttempts?: number;
  /** The seller pressed "Try again": clear a failed step's attempts first. */
  force?: boolean;
}

export const MAX_ATTEMPTS = 3;

export async function runStep<T>(
  store: StepStore,
  key: StepKey,
  opts: RunOptions,
  work: () => Promise<T>,
): Promise<StepOutcome<T>> {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  await store.ensure(key);

  const before = await store.get(key);
  if (before?.status === "done") return { state: "done", result: before.result as T, fresh: false };
  if (opts.force && before?.status === "failed") await store.reset(key);

  if (!(await store.claim(key, opts.lockMs, maxAttempts))) {
    const row = await store.get(key);
    if (!row) throw new Error(`Step row vanished: ${key.step}/${key.target}`);
    if (row.status === "done") return { state: "done", result: row.result as T, fresh: false };
    if (row.status === "running" && row.lockValid) return { state: "running" };
    // Out of attempts. A run that died holding the lock still says "running"; record it.
    if (row.status === "running") await store.fail(key, row.lastError ?? "The step took too long and was stopped.");
    return {
      state: "failed",
      error: row.lastError ?? "The step took too long and was stopped.",
      attempts: row.attempts,
      exhausted: true,
    };
  }

  try {
    const result = await work();
    await store.complete(key, result);
    return { state: "done", result, fresh: true };
  } catch (err) {
    const error = describeError(err);
    await store.fail(key, error);
    const row = await store.get(key);
    const attempts = row?.attempts ?? maxAttempts;
    return { state: "failed", error, attempts, exhausted: attempts >= maxAttempts };
  }
}

/**
 * An error whose message was written for the seller ("The photo file is missing.",
 * "The AI is busy right now."). Steps and providers throw these on purpose.
 */
export class StepError extends Error {
  override name = "StepError";
}

export const GENERIC_STEP_ERROR = "Something went wrong on our side. Your work is saved.";

/**
 * What goes into last_error, which the seller sees: a StepError's own words, cut
 * short; anything else (a database error, a bug) becomes one generic line, and the
 * real message goes to the server log only.
 */
export function describeError(err: unknown): string {
  if (err instanceof StepError) return err.message.slice(0, 480);
  console.error("[pipeline] unexpected step error:", err);
  return GENERIC_STEP_ERROR;
}
