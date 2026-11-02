import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDictation,
  findDictation,
  hasRoom,
  MAX_AGE_MS,
  newDictationId,
  PER_WORKSPACE,
  removeDictation,
  resetDictations,
  TOTAL,
} from "./sessions";
import type { LiveTranscription } from "@/server/providers/types";

const live = (): LiveTranscription => ({ push: vi.fn(), end: vi.fn(), cancel: vi.fn() });
const add = (workspaceId: string, onExpire = () => {}) =>
  addDictation({ id: newDictationId(), workspaceId, live: live() }, onExpire);

afterEach(() => {
  resetDictations();
  vi.useRealTimers();
});

describe("live dictation sessions", () => {
  it("are found only by the shop that started them", () => {
    const d = add("ws-a");
    expect(findDictation(d.id, "ws-a")).toBe(d);
    expect(findDictation(d.id, "ws-b")).toBeNull();
    removeDictation(d.id);
    expect(findDictation(d.id, "ws-a")).toBeNull();
  });

  it("allow a few per shop and a cap overall", () => {
    for (let i = 0; i < PER_WORKSPACE; i++) add("ws-a");
    expect(hasRoom("ws-a")).toBe(false);
    expect(hasRoom("ws-b")).toBe(true);
    resetDictations();
    for (let i = 0; i < TOTAL; i++) add(`ws-${i}`);
    expect(hasRoom("ws-new")).toBe(false);
  });

  it("expire if left running", () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    add("ws-a", expired);
    vi.advanceTimersByTime(MAX_AGE_MS - 1);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledOnce();
  });

  it("have ids no one can guess", () => {
    const ids = new Set(Array.from({ length: 50 }, newDictationId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
