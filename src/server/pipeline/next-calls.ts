import { MAX_ATTEMPTS } from "./run-step";

/**
 * Decides which step calls the browser should make next, from the saved state alone.
 * Pure, so a refresh, a second tab or a later background runner all reach the same
 * answer.
 *
 * Order: plan → segment → group, one at a time. Then per listing: write, then
 * translate; renders need only the cutout, so they run beside write. At most two
 * listings are worked on at once to stay under Muse Image's rate limit.
 *
 * A job with a voice note has a `listen` step row too. It needs nothing before it, so it
 * runs beside plan; write waits for it, unless it is out of attempts, when the listing
 * is written from the photo alone rather than held up by the note.
 */

export type JobStepName = "plan" | "segment" | "group" | "listen";
export type ListingStepName = "write" | "translate" | "render";

export interface StepState {
  step: string;
  target: string;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
}

export type NextCall =
  { kind: "job"; step: JobStepName } | { kind: "listing"; step: ListingStepName; listingId: string; scene?: string };

export interface NextInput {
  jobStatus: "processing" | "awaiting_choice" | "ready" | "failed";
  steps: StepState[];
  listingIds: string[];
  scenes: string[];
  translate: boolean;
  maxAttempts?: number;
  listingsAtOnce?: number;
}

export const JOB_ORDER: JobStepName[] = ["plan", "segment", "group"];
const LISTEN: NextCall = { kind: "job", step: "listen" };

/** The job step that must be done before this one may run; null for the first. */
export const stepBefore = (step: JobStepName): JobStepName | null => JOB_ORDER[JOB_ORDER.indexOf(step) - 1] ?? null;

export const renderTarget = (listingId: string, scene: string) => `${listingId}:${scene}`;

export function nextCalls(input: NextInput): NextCall[] {
  const max = input.maxAttempts ?? MAX_ATTEMPTS;
  const byKey = new Map(input.steps.map((s) => [`${s.step}|${s.target}`, s]));
  const state = (step: string, target: string) => byKey.get(`${step}|${target}`);
  const isDone = (step: string, target: string) => state(step, target)?.status === "done";
  /** Failed with attempts left (or never tried) means it should be called; out of attempts waits for "Try again". */
  const callable = (step: string, target: string) => {
    const s = state(step, target);
    if (!s) return true;
    if (s.status === "done") return false;
    if (s.status === "failed") return s.attempts < max;
    return true; // pending, or running: the call answers 202 until the lock clears
  };

  if (input.jobStatus === "awaiting_choice" || input.jobStatus === "failed") return [];

  // no row means no voice note
  const listening = !!state("listen", "-") && callable("listen", "-");
  const listen = listening ? [LISTEN] : [];

  for (const step of JOB_ORDER) {
    if (isDone(step, "-")) continue;
    return callable(step, "-") ? [...listen, { kind: "job", step }] : listen;
  }

  const calls: NextCall[] = [...listen];
  let active = 0;
  for (const listingId of input.listingIds) {
    const pending: NextCall[] = [];
    let unfinished = false;

    if (!isDone("write", listingId)) {
      unfinished = true;
      if (!listening && callable("write", listingId)) pending.push({ kind: "listing", step: "write", listingId });
    } else if (input.translate && !isDone("translate", listingId)) {
      unfinished = true;
      if (callable("translate", listingId)) pending.push({ kind: "listing", step: "translate", listingId });
    }
    for (const scene of input.scenes) {
      const target = renderTarget(listingId, scene);
      if (isDone("render", target)) continue;
      unfinished = true;
      if (callable("render", target)) pending.push({ kind: "listing", step: "render", listingId, scene });
    }

    if (!unfinished) continue;
    calls.push(...pending);
    if (++active >= (input.listingsAtOnce ?? 2)) break;
  }
  return calls;
}

/** True when nothing is left to run or retry: every step is done or out of attempts. */
export function isSettled(input: NextInput): boolean {
  if (input.jobStatus === "awaiting_choice") return false;
  return nextCalls({ ...input, listingsAtOnce: Number.MAX_SAFE_INTEGER }).length === 0;
}
