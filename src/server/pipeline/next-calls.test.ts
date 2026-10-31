import { describe, expect, it } from "vitest";
import { isSettled, nextCalls, renderTarget, stepBefore, type NextInput, type StepState } from "./next-calls";

const done = (step: string, target = "-"): StepState => ({ step, target, status: "done", attempts: 1 });
const failed = (step: string, target: string, attempts: number): StepState => ({
  step,
  target,
  status: "failed",
  attempts,
});

const base: NextInput = { jobStatus: "processing", steps: [], listingIds: [], scenes: ["studio"], translate: true };

describe("nextCalls", () => {
  it("runs plan, segment and group one at a time, in order", () => {
    expect(nextCalls(base)).toEqual([{ kind: "job", step: "plan" }]);
    expect(nextCalls({ ...base, steps: [done("plan")] })).toEqual([{ kind: "job", step: "segment" }]);
    expect(nextCalls({ ...base, steps: [done("plan"), done("segment")] })).toEqual([{ kind: "job", step: "group" }]);
  });

  it("names the step each job step waits for", () => {
    expect(stepBefore("plan")).toBeNull();
    expect(stepBefore("segment")).toBe("plan");
    expect(stepBefore("group")).toBe("segment");
  });

  it("calls nothing while the seller is choosing items", () => {
    expect(
      nextCalls({ ...base, jobStatus: "awaiting_choice", steps: [done("plan"), done("segment"), done("group")] }),
    ).toEqual([]);
  });

  it("writes and renders side by side, and translates after writing", () => {
    const jobDone = [done("plan"), done("segment"), done("group")];
    expect(nextCalls({ ...base, steps: jobDone, listingIds: ["L1"] })).toEqual([
      { kind: "listing", step: "write", listingId: "L1" },
      { kind: "listing", step: "render", listingId: "L1", scene: "studio" },
    ]);
    expect(
      nextCalls({
        ...base,
        steps: [...jobDone, done("write", "L1"), done("render", renderTarget("L1", "studio"))],
        listingIds: ["L1"],
      }),
    ).toEqual([{ kind: "listing", step: "translate", listingId: "L1" }]);
  });

  it("works on at most two listings at once", () => {
    const calls = nextCalls({
      ...base,
      steps: [done("plan"), done("segment"), done("group")],
      listingIds: ["L1", "L2", "L3"],
      translate: false,
    });
    expect(new Set(calls.map((c) => (c.kind === "listing" ? c.listingId : "")))).toEqual(new Set(["L1", "L2"]));
  });

  it("retries a failed step while attempts are left, then waits for Try again", () => {
    const steps = [done("plan"), failed("segment", "-", 2)];
    expect(nextCalls({ ...base, steps })).toEqual([{ kind: "job", step: "segment" }]);
    expect(nextCalls({ ...base, steps: [done("plan"), failed("segment", "-", 3)] })).toEqual([]);
  });

  it("is settled only when everything is done or out of attempts", () => {
    const jobDone = [done("plan"), done("segment"), done("group")];
    const input = { ...base, steps: jobDone, listingIds: ["L1"] };
    expect(isSettled(input)).toBe(false);
    expect(
      isSettled({
        ...input,
        steps: [...jobDone, done("write", "L1"), done("translate", "L1"), done("render", "L1:studio")],
      }),
    ).toBe(true);
    expect(
      isSettled({
        ...input,
        steps: [...jobDone, done("write", "L1"), done("translate", "L1"), failed("render", "L1:studio", 3)],
      }),
    ).toBe(true);
  });
});
