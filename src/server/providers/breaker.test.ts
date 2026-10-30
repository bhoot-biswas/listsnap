import { afterEach, describe, expect, it, vi } from "vitest";
import { StepError } from "@/server/pipeline/run-step";
import { BREAKER_COOLDOWN_MS, BREAKER_THRESHOLD, guard, noteRateLimit, record, resetBreakers } from "./breaker";

afterEach(() => resetBreakers());

const fails = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
};

describe("circuit breaker", () => {
  it("stays closed through fewer failures than the threshold, and a success resets the count", () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) record("spark", false, 0);
    record("spark", true, 0);
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) record("spark", false, 0);
    expect(fails(() => guard("spark", "busy", 1))).toBeNull();
  });

  it("opens after failures in a row, failing fast without costing an attempt", () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) record("image", false, 1000);
    const err = fails(() => guard("image", "busy", 1001));
    expect(err).toBeInstanceOf(StepError);
    expect((err as StepError).notAttempted).toBe(true);
    // other services are unaffected
    expect(fails(() => guard("spark", "busy", 1001))).toBeNull();
  });

  it("lets one trial through after the cooldown; a failed trial reopens, a good one closes", () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) record("sam", false, 0);
    expect(fails(() => guard("sam", "busy", BREAKER_COOLDOWN_MS))).toBeNull();
    record("sam", false, BREAKER_COOLDOWN_MS);
    expect(fails(() => guard("sam", "busy", BREAKER_COOLDOWN_MS + 1))).toBeInstanceOf(StepError);

    expect(fails(() => guard("sam", "busy", 2 * BREAKER_COOLDOWN_MS + 1))).toBeNull();
    record("sam", true, 2 * BREAKER_COOLDOWN_MS + 1);
    expect(fails(() => guard("sam", "busy", 2 * BREAKER_COOLDOWN_MS + 2))).toBeNull();
  });
});

describe("noteRateLimit", () => {
  it("warns only when less than a tenth of the budget is left", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    noteRateLimit(
      "spark",
      new Headers({ "x-ratelimit-remaining-requests": "50", "x-ratelimit-limit-requests": "100" }),
    );
    expect(warn).not.toHaveBeenCalled();
    noteRateLimit("spark", new Headers({ "x-ratelimit-remaining-requests": "5", "x-ratelimit-limit-requests": "100" }));
    expect(warn).toHaveBeenCalledWith("[rate-limit] spark: 5 of 100 requests left");
    noteRateLimit("spark", new Headers());
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
