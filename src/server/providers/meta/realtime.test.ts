import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "../breaker";
import type { LiveEvents } from "../types";

vi.mock("@/server/env", () => ({ env: () => ({ modelApiKey: "LLM_test_key" }) }));
vi.mock("../log", () => ({ logged: (_ctx: unknown, _info: unknown, fn: () => unknown) => fn() }));

/** Stands in for Meta's realtime socket: records what's sent, lets the test answer. */
class FakeSocket {
  static last: FakeSocket | null = null;
  binaryType = "blob";
  sent: (string | Buffer)[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(data: string | Buffer) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  answer(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  get texts() {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d));
  }
  get audioBytes() {
    return this.sent.filter((d) => typeof d !== "string").reduce((n, d) => n + d.length, 0);
  }
}

const { liveTranscribeLive } = await import("./realtime");
const ctx = { workspaceId: "ws", jobId: null, step: "dictate" };
const events = () => ({ partial: vi.fn(), final: vi.fn(), failed: vi.fn() }) satisfies LiveEvents;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetBreakers();
});

describe("live Muse Voice Transcribe", () => {
  it("sends the key in the handshake, streams the audio, and hands back the words", async () => {
    const ev = events();
    const live = liveTranscribeLive(ctx, ["শাড়ি"], ev);
    const ws = FakeSocket.last!;
    ws.onopen?.();
    expect(ws.texts[0]).toMatchObject({
      authorization: { accessToken: "Bearer LLM_test_key" },
      mode: "PUSH_TO_TALK",
      audioEncoding: "PCM_24KHZ",
      partialMode: "CUMULATIVE",
      keywords: ["শাড়ি"],
    });
    ws.answer({ sessionId: "s1" });

    live.push(Buffer.alloc(48 * 1000));
    await vi.advanceTimersByTimeAsync(2000);
    ws.answer({ type: "transcript", transcript: "দেড় হাজার", final: false, audioProcessedMs: 900 });
    expect(ev.partial).toHaveBeenCalledWith("দেড় হাজার");

    live.end();
    await vi.advanceTimersByTimeAsync(200);
    expect(ws.audioBytes).toBe(48 * 1000);
    expect(ws.texts.at(-1)).toEqual({ type: "endStream" });
    ws.answer({ type: "transcript", transcript: "দেড় হাজার টাকা।", final: true, audioProcessedMs: 1000 });
    expect(ev.final).toHaveBeenCalledWith("দেড় হাজার টাকা।");
    expect(ws.closed).toBe(true);
    expect(ev.failed).not.toHaveBeenCalled();
  });

  it("says busy when Meta closes the session for load", () => {
    const ev = events();
    liveTranscribeLive(ctx, [], ev);
    const ws = FakeSocket.last!;
    ws.onopen?.();
    ws.answer({ sessionId: "s1" });
    ws.onclose?.({ code: 1013, reason: "rate limited" });
    expect(ev.failed).toHaveBeenCalledWith("busy");
  });

  it("gives up when the handshake never comes back", async () => {
    const ev = events();
    liveTranscribeLive(ctx, [], ev);
    FakeSocket.last!.onopen?.();
    await vi.advanceTimersByTimeAsync(10_001);
    expect(ev.failed).toHaveBeenCalledWith("busy");
  });

  it("lets the phone know when its audio stopped arriving", async () => {
    const ev = events();
    const live = liveTranscribeLive(ctx, [], ev);
    const ws = FakeSocket.last!;
    ws.onopen?.();
    ws.answer({ sessionId: "s1" });
    live.push(Buffer.alloc(48 * 250));
    await vi.advanceTimersByTimeAsync(6000);
    expect(ev.failed).toHaveBeenCalledWith("lost");
  });

  it("says nothing more once the seller has left", () => {
    const ev = events();
    const live = liveTranscribeLive(ctx, [], ev);
    const ws = FakeSocket.last!;
    ws.onopen?.();
    ws.answer({ sessionId: "s1" });
    live.cancel();
    expect(ws.closed).toBe(true);
    ws.onclose?.({ code: 1000, reason: "" });
    expect(ev.failed).not.toHaveBeenCalled();
  });
});
