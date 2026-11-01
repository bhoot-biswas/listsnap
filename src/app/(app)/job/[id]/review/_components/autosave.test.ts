import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver, type SaveState } from "./autosave";

describe("Autosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for typing to pause, then saves only the latest value", async () => {
    const saved: string[] = [];
    const s = new Autosaver<string>(
      "",
      async (v) => (saved.push(v), true),
      () => {},
      800,
    );
    s.change("a");
    s.change("ab");
    s.change("abc");
    await vi.advanceTimersByTimeAsync(800);
    expect(saved).toEqual(["abc"]);
  });

  it("flush saves straight away, and nothing twice", async () => {
    const saved: string[] = [];
    const s = new Autosaver<string>(
      "",
      async (v) => (saved.push(v), true),
      () => {},
    );
    s.change("x");
    expect(await s.flush()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved).toEqual(["x"]);
  });

  it("retries a failed save, but not one the server called invalid", async () => {
    const states: SaveState[] = [];
    let calls = 0;
    const flaky = new Autosaver<string>(
      "",
      async () => (++calls === 1 ? false : true),
      (st) => states.push(st),
      10,
      100,
    );
    flaky.change("v");
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)).toBe("error");
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);
    expect(states.at(-1)).toBe("saved");

    let invalidCalls = 0;
    const invalid = new Autosaver<string>(
      "",
      async () => (++invalidCalls, "invalid"),
      () => {},
      10,
      100,
    );
    invalid.change("bad");
    await vi.advanceTimersByTimeAsync(1000);
    expect(invalidCalls).toBe(1);
  });

  it("is pending until the save has finished, and says when the server called it invalid", async () => {
    const states: SaveState[] = [];
    let finish: (v: true | "invalid") => void = () => {};
    const s = new Autosaver<string>(
      "",
      () => new Promise((r) => (finish = r)),
      (st) => states.push(st),
      10,
    );
    expect(s.pending).toBe(false);
    s.change("a");
    expect(s.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    // sent, but not answered yet: closing the tab now would still lose it
    expect(s.pending).toBe(true);
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.pending).toBe(false);

    s.change("too long");
    await vi.advanceTimersByTimeAsync(10);
    finish("invalid");
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("invalid");
  });
});
