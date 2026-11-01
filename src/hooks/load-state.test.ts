import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadState } from "./load-state";

const answer = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

describe("loading a job's or batch's state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rides out a few failures right after the connection comes back", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(answer(502))
      .mockResolvedValueOnce(answer(200, { id: "j1" }));
    vi.stubGlobal("fetch", fetch);
    const loaded = loadState<{ id: string }>("/api/jobs/j1");
    await vi.runAllTimersAsync();
    expect(await loaded).toEqual({ state: { id: "j1" } });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("gives up after its tries, and says offline at once when the phone is", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(500)));
    const loaded = loadState("/api/jobs/j1", 3);
    await vi.runAllTimersAsync();
    expect(await loaded).toEqual({ error: "unreachable" });

    vi.stubGlobal("navigator", { onLine: false });
    const fetch = vi.fn().mockRejectedValue(new TypeError("network"));
    vi.stubGlobal("fetch", fetch);
    expect(await loadState("/api/jobs/j1")).toEqual({ error: "offline" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends a signed-out seller to sign in instead of retrying", async () => {
    const fetch = vi.fn().mockResolvedValue(answer(401));
    vi.stubGlobal("fetch", fetch);
    expect(await loadState("/api/jobs/j1")).toEqual({ error: "signed-out" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
