import { describe, expect, it, vi } from "vitest";
import {
  GENERIC_STEP_ERROR,
  PermanentError,
  runStep,
  StepError,
  type StepKey,
  type StepRow,
  type StepStore,
} from "./run-step";
import { parseStoredError, storedError } from "@/server/step-text";

/** The same semantics as job_steps, in memory, with a clock the test controls. */
function memoryStore() {
  let now = 0;
  const rows = new Map<string, StepRow & { lockedUntil: number }>();
  const id = (k: StepKey) => `${k.jobId}|${k.step}|${k.target}`;
  const store: StepStore = {
    async ensure(k) {
      if (!rows.has(id(k)))
        rows.set(id(k), {
          status: "pending",
          attempts: 0,
          lastError: null,
          result: null,
          lockValid: false,
          lockedUntil: 0,
        });
    },
    async get(k) {
      const r = rows.get(id(k));
      return r ? { ...r, lockValid: r.lockedUntil > now } : null;
    },
    async claim(k, lockMs, max) {
      const r = rows.get(id(k))!;
      const free = r.status === "pending" || r.status === "failed" || (r.status === "running" && r.lockedUntil < now);
      if (!free || r.attempts >= max) return false;
      Object.assign(r, { status: "running", attempts: r.attempts + 1, lockedUntil: now + lockMs });
      return true;
    },
    async complete(k, result) {
      Object.assign(rows.get(id(k))!, { status: "done", result, lastError: null, lockedUntil: 0 });
    },
    async fail(k, error, adjust) {
      const r = rows.get(id(k))!;
      const attempts =
        adjust && "exhaust" in adjust
          ? Math.max(r.attempts, adjust.exhaust)
          : adjust?.refund
            ? Math.max(0, r.attempts - 1)
            : r.attempts;
      Object.assign(r, { status: "failed", lastError: error, lockedUntil: 0, attempts });
    },
    async reset(k, o) {
      const r = rows.get(id(k))!;
      if (r.status === "failed" || (o?.done && r.status === "done"))
        Object.assign(r, { status: "pending", attempts: 0, lastError: null });
    },
  };
  return { store, advance: (ms: number) => (now += ms), row: (k: StepKey) => rows.get(id(k)) };
}

const key: StepKey = { jobId: "job-1", step: "plan", target: "-" };
const opts = { lockMs: 45_000 };

describe("runStep step rules", () => {
  it("returns the saved result of a finished step without doing the work again", async () => {
    const { store } = memoryStore();
    const work = vi.fn(async () => ({ phrase: "jamdani saree" }));
    expect(await runStep(store, key, opts, work)).toEqual({
      state: "done",
      result: { phrase: "jamdani saree" },
      fresh: true,
    });
    expect(await runStep(store, key, opts, work)).toEqual({
      state: "done",
      result: { phrase: "jamdani saree" },
      fresh: false,
    });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("runs once when two requests arrive together; the other is told it's running", async () => {
    const { store } = memoryStore();
    let release!: () => void;
    const work = vi.fn(() => new Promise<string>((r) => (release = () => r("ok"))));
    const first = runStep(store, key, opts, work);
    await vi.waitFor(() => expect(work).toHaveBeenCalled());
    expect(await runStep(store, key, opts, work)).toEqual({ state: "running" });
    release();
    expect(await first).toMatchObject({ state: "done", result: "ok" });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("retries a step whose lock expired (the request died mid-way)", async () => {
    const { store, advance } = memoryStore();
    await store.ensure(key);
    await store.claim(key, opts.lockMs, 3); // a run that never finished
    expect(await runStep(store, key, opts, async () => "late")).toEqual({ state: "running" });
    advance(45_001);
    expect(await runStep(store, key, opts, async () => "second try")).toMatchObject({
      state: "done",
      result: "second try",
    });
  });

  it("runs a finished step again only when a new version is asked for", async () => {
    const { store } = memoryStore();
    await runStep(store, key, opts, async () => "first");
    expect(await runStep(store, key, { ...opts, force: true }, async () => "second")).toMatchObject({
      result: "first",
    });
    expect(await runStep(store, key, { ...opts, redo: true }, async () => "second")).toEqual({
      state: "done",
      result: "second",
      fresh: true,
    });
  });

  it("allows 3 attempts after failures, then waits for Try again", async () => {
    const { store, row } = memoryStore();
    const boom = vi.fn(async () => {
      throw new StepError("busy");
    });
    expect(await runStep(store, key, opts, boom)).toEqual({
      state: "failed",
      error: storedError("busy"),
      attempts: 1,
      exhausted: false,
    });
    expect(await runStep(store, key, opts, boom)).toMatchObject({ attempts: 2, exhausted: false });
    expect(await runStep(store, key, opts, boom)).toMatchObject({ attempts: 3, exhausted: true });
    // a fourth call does not run the work
    expect(await runStep(store, key, opts, boom)).toMatchObject({ state: "failed", exhausted: true });
    expect(boom).toHaveBeenCalledTimes(3);
    expect(row(key)?.status).toBe("failed");

    // "Try again" clears the attempts and runs it
    expect(await runStep(store, key, { ...opts, force: true }, async () => "fixed")).toMatchObject({
      state: "done",
      result: "fixed",
    });
  });

  it("marks a step failed when its last attempt died holding the lock", async () => {
    const { store, advance, row } = memoryStore();
    await store.ensure(key);
    for (let i = 0; i < 3; i++) {
      await store.claim(key, opts.lockMs, 3);
      advance(45_001);
    }
    const out = await runStep(store, key, opts, async () => "never");
    expect(out).toMatchObject({ state: "failed", exhausted: true });
    expect(row(key)?.status).toBe("failed");
  });

  it("keeps a StepError as its key and values, with a long quoted value cut short", async () => {
    const { store } = memoryStore();
    const out = await runStep(store, key, opts, async () => {
      throw new StepError("productChanged", { params: { differences: "x".repeat(2000) } });
    });
    const error = out.state === "failed" ? out.error : "";
    expect(error.length).toBeLessThan(500); // job_steps.last_error is VARCHAR(500)
    expect(parseStoredError(error)).toEqual({ key: "productChanged", params: { differences: "x".repeat(200) } });
  });

  it("never shows an unexpected error's text (a SQL error, a bug)", async () => {
    const { store } = memoryStore();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runStep(store, key, opts, async () => {
      throw new Error("You have an error in your SQL syntax near 'JSON)'");
    });
    expect(out).toMatchObject({ state: "failed", error: GENERIC_STEP_ERROR });
  });

  it("uses up the attempts at once when a retry can't help", async () => {
    const { store } = memoryStore();
    const refused = async () => {
      throw new PermanentError("Muse Spark HTTP 400: unknown field");
    };
    expect(await runStep(store, key, opts, refused)).toMatchObject({
      state: "failed",
      error: GENERIC_STEP_ERROR,
      attempts: 3,
      exhausted: true,
    });
    const blocked = async () => {
      throw new StepError("blocked", { permanent: true });
    };
    const other = { ...key, step: "render" };
    expect(await runStep(store, other, opts, blocked)).toMatchObject({
      error: storedError("blocked"),
      exhausted: true,
    });
  });

  it("gives the attempt back when the service was never called", async () => {
    const { store } = memoryStore();
    const open = async () => {
      throw new StepError("busy", { notAttempted: true });
    };
    for (let i = 0; i < 5; i++)
      expect(await runStep(store, key, opts, open)).toMatchObject({ state: "failed", attempts: 0, exhausted: false });
    // once the service is back, the step still has all its attempts
    expect(await runStep(store, key, opts, async () => "ok")).toEqual({ state: "done", result: "ok", fresh: true });
  });
});
