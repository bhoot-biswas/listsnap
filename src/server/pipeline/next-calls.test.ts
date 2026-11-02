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

  it("listens to a voice note beside the photo steps, and writes only once it has", () => {
    const listen = { step: "listen", target: "-", status: "pending", attempts: 0 } as const;
    expect(nextCalls({ ...base, steps: [listen] })).toEqual([
      { kind: "job", step: "listen" },
      { kind: "job", step: "plan" },
    ]);
    const jobDone = [done("plan"), done("segment"), done("group")];
    // still listening: renders may start, write waits
    expect(nextCalls({ ...base, steps: [...jobDone, listen], listingIds: ["L1"] })).toEqual([
      { kind: "job", step: "listen" },
      { kind: "listing", step: "render", listingId: "L1", scene: "studio" },
    ]);
    expect(nextCalls({ ...base, steps: [...jobDone, done("listen")], listingIds: ["L1"] })).toContainEqual({
      kind: "listing",
      step: "write",
      listingId: "L1",
    });
  });

  it("writes from the photo alone once the voice note is out of attempts", () => {
    const steps = [done("plan"), done("segment"), done("group"), failed("listen", "-", 3)];
    const calls = nextCalls({ ...base, steps, listingIds: ["L1"] });
    expect(calls).toContainEqual({ kind: "listing", step: "write", listingId: "L1" });
    expect(calls).not.toContainEqual({ kind: "job", step: "listen" });
    expect(
      isSettled({ ...base, steps: [...steps, done("write", "L1")], listingIds: ["L1"], scenes: [], translate: false }),
    ).toBe(true);
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

describe("listings whose steps are out of attempts", () => {
  const jobDone = [done("plan"), done("segment"), done("group")];
  const used = (listingId: string) => failed("render", renderTarget(listingId, "studio"), 3);
  const written = (listingId: string) => [done("write", listingId), done("translate", listingId)];

  it("don't hold up the listings after them", () => {
    // the day's AI photos ran out: the first two listings' photos failed for good
    const input = {
      ...base,
      steps: [...jobDone, ...written("L1"), used("L1"), ...written("L2"), used("L2")],
      listingIds: ["L1", "L2", "L3", "L4"],
    };
    expect(nextCalls(input)).toEqual([
      { kind: "listing", step: "write", listingId: "L3" },
      { kind: "listing", step: "render", listingId: "L3", scene: "studio" },
      { kind: "listing", step: "write", listingId: "L4" },
      { kind: "listing", step: "render", listingId: "L4", scene: "studio" },
    ]);
    expect(isSettled(input)).toBe(false);
  });

  it("settle the job once nothing else can run", () => {
    const steps = [...jobDone, ...["L1", "L2", "L3"].flatMap((l) => [...written(l), used(l)])];
    const input = { ...base, steps, listingIds: ["L1", "L2", "L3"] };
    expect(nextCalls(input)).toEqual([]);
    expect(isSettled(input)).toBe(true);
  });

  it("spend no photos on a listing whose writing gave up", () => {
    const input = { ...base, steps: [...jobDone, failed("write", "L1", 3)], listingIds: ["L1", "L2"] };
    expect(nextCalls(input)).toEqual([
      { kind: "listing", step: "write", listingId: "L2" },
      { kind: "listing", step: "render", listingId: "L2", scene: "studio" },
    ]);
    // Try again on the writing brings its photos back
    expect(nextCalls({ ...base, steps: [...jobDone, failed("write", "L1", 0)], listingIds: ["L1"] })).toEqual([
      { kind: "listing", step: "write", listingId: "L1" },
      { kind: "listing", step: "render", listingId: "L1", scene: "studio" },
    ]);
  });
});
