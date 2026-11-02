import { describe, expect, it } from "vitest";
import { BYTES_PER_MS, Pacer, PACER_DEFAULTS, TICK_MS, type TickResult } from "./pacer";

const CHUNK_MS = 250;
const chunk = (ms = CHUNK_MS) => Buffer.alloc(ms * BYTES_PER_MS, 1);
const sentIn = (r: TickResult) => (r.state === "lost" ? 0 : r.frames.reduce((n, f) => n + f.length, 0) / BYTES_PER_MS);

/**
 * Drives a pacer through a phone's uploads: `arrive(ms)` says when the upload holding the
 * audio recorded up to `ms` reaches the server. Returns every tick's time, result and
 * how much had been sent by then.
 */
function run(totalMs: number, arrive: (recordedTo: number) => number, pacer = new Pacer()) {
  const uploads = [];
  for (let to = CHUNK_MS; to <= totalMs; to += CHUNK_MS) uploads.push({ at: arrive(to), to });
  const ticks: { now: number; result: TickResult; sentMs: number }[] = [];
  let next = 0;
  const origin = uploads[0].at;
  for (let now = origin; now < origin + totalMs + 20_000; now += TICK_MS) {
    while (next < uploads.length && uploads[next].at <= now) {
      pacer.push(chunk(), uploads[next].at);
      next++;
    }
    if (next === uploads.length) pacer.finish();
    const result = pacer.tick(now);
    ticks.push({ now: now - origin, result, sentMs: pacer.sentMs });
    if (result.state !== "sending") break;
  }
  return { ticks, pacer, last: ticks[ticks.length - 1] };
}

describe("dictation pacer", () => {
  it("sends a steady phone's audio evenly, a cushion behind", () => {
    const { ticks, last } = run(10_000, (to) => to + 40);
    expect(last.result.state).toBe("drained");
    expect(last.sentMs).toBe(10_000);
    const steady = ticks.filter((t) => t.now > 1500 && t.now < 9500);
    for (const t of steady) {
      // never closer to the phone than the cushion, never more than a tick behind it
      expect(t.now - t.sentMs).toBeGreaterThanOrEqual(PACER_DEFAULTS.cushionMs - 1);
      expect(t.now - t.sentMs).toBeLessThanOrEqual(PACER_DEFAULTS.cushionMs + TICK_MS + 1);
      // the same amount every tick, not the phone's bursts
      expect(sentIn(t.result)).toBeCloseTo(TICK_MS, 0);
    }
  });

  it("smooths uploads that arrive unevenly", () => {
    let prev = 0;
    const jitter = [0, 600, 120, 450, 30, 580, 200, 0, 350];
    let i = 0;
    const { ticks, last } = run(12_000, (to) => (prev = Math.max(prev, to + jitter[i++ % jitter.length])));
    expect(last.result.state).toBe("drained");
    expect(last.sentMs).toBe(12_000);
    for (const t of ticks.filter((x) => x.now > 2000 && x.now < 11_000))
      expect(sentIn(t.result)).toBeCloseTo(TICK_MS, 0);
  });

  it("pads silence through a long gap, then catches up without a burst", () => {
    // uploads stop for 4.75 s at 5 s (just inside the quiet limit), then everything
    // recorded meanwhile arrives at once
    const { ticks, pacer, last } = run(15_000, (to) => (to > 5000 && to <= 9750 ? 9750 : to));
    expect(last.result.state).toBe("drained");
    expect(pacer.silencePaddedMs).toBeGreaterThan(0);
    expect(last.sentMs).toBe(15_000 + pacer.silencePaddedMs);
    for (const t of ticks) {
      // never far ahead of real time: the socket refuses more than 5 s of backlog
      expect(t.sentMs - t.now).toBeLessThanOrEqual(PACER_DEFAULTS.leadMs + 1);
      // and never a big lump in one go
      expect(sentIn(t.result)).toBeLessThanOrEqual(PACER_DEFAULTS.padAfterMs);
    }
  });

  it("gives up when the phone goes quiet", () => {
    const pacer = new Pacer();
    pacer.push(chunk(), 0);
    expect(pacer.tick(1000).state).toBe("sending");
    expect(pacer.tick(PACER_DEFAULTS.quietMs + 100)).toEqual({ state: "lost", reason: "quiet" });
  });

  it("gives up when too much is waiting to be live", () => {
    const pacer = new Pacer();
    pacer.push(chunk(PACER_DEFAULTS.maxBufferMs + 500), 0);
    expect(pacer.tick(0)).toEqual({ state: "lost", reason: "backlog" });
  });

  it("is drained at once when the seller stops before any audio", () => {
    const pacer = new Pacer();
    pacer.finish();
    expect(pacer.tick(0)).toEqual({ state: "drained", frames: [] });
  });

  it("sends the tail on stop no faster than the lead allows", () => {
    const pacer = new Pacer();
    pacer.push(chunk(4000), 0);
    pacer.finish();
    const first = pacer.tick(0);
    expect(first.state).toBe("sending");
    expect(sentIn(first)).toBe(PACER_DEFAULTS.leadMs);
    let now = 0;
    let r = first;
    while (r.state === "sending") r = pacer.tick((now += TICK_MS));
    expect(r.state).toBe("drained");
    expect(pacer.sentMs).toBe(4000);
    expect(now).toBeGreaterThanOrEqual(4000 - PACER_DEFAULTS.leadMs - TICK_MS);
  });
});
