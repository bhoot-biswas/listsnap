"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BatchState } from "@/lib/batch-state";
import { loadState } from "./load-state";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jobs worked on at once: Muse Image's 150 images a minute sets the pace. */
export const JOBS_AT_ONCE = 2;

/**
 * Drives a bulk batch from the browser, two photos at a time, after watching its video
 * when it comes from one. Like the single-job
 * runner it only makes the calls the server lists as next, so pausing, a refresh or a
 * second tab never repeats finished work. Closing the tab pauses the batch; it starts
 * by itself only right after the upload (`autoStart`), otherwise it waits for Resume.
 * Losing the connection, or the state, isn't a pause: it carries on by itself once the
 * connection or the tab is back, and says what's happening meanwhile.
 */
export function useBatchRunner(initial: BatchState, autoStart: boolean) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [running, setRunning] = useState(false);
  // the seller's own Pause, as opposed to a dropped connection
  const [paused, setPaused] = useState(!autoStart);
  const [offline, setOffline] = useState(false);
  /** The batch's state couldn't be loaded, so nothing moves until it can be. */
  const [stalled, setStalled] = useState(false);
  const wanted = useRef(autoStart);
  const busy = useRef(false);
  const alive = useRef(true);
  const id = initial.id;


  const load = useCallback(async (): Promise<BatchState | null> => {
    const r = await loadState<BatchState>(`/api/batches/${id}`);
    if ("error" in r) {
      if (r.error === "signed-out") router.push("/sign-in");
      // without a state there's nothing to call next; say so instead of looking paused
      else if (alive.current) (r.error === "offline" ? setOffline : setStalled)(true);
      return null;
    }
    if (alive.current) {
      setState(r.state);
      setStalled(false);
    }
    return r.state;
  }, [id, router]);

  const drive = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    try {
      let s = await load();
      while (alive.current && wanted.current && s) {
        if (!navigator.onLine) {
          setOffline(true);
          return;
        }
        // a video batch has no jobs until its video is watched, which makes them
        if (s.watch?.url) {
          const st = await fetch(s.watch.url, { method: "POST" })
            .then((r) => r.status)
            .catch(() => 0);
          if (st === 401) {
            router.push("/sign-in");
            return;
          }
          if (st === 202 || st === 422 || st === 0) await sleep(2000);
          s = await load();
          continue;
        }
        const active = s.rows.filter((r) => r.jobStatus === "processing" && r.next.length > 0).slice(0, JOBS_AT_ONCE);
        if (!active.length) break;
        const statuses = await Promise.all(
          active
            .flatMap((r) => r.next)
            .map((c) =>
              fetch(c.url, { method: "POST" })
                .then((r) => r.status)
                .catch(() => 0),
            ),
        );
        if (statuses.includes(401)) {
          router.push("/sign-in");
          return;
        }
        // 202: another tab holds the step; 422 or a dropped request: wait, then ask again
        if (statuses.some((st) => st === 202 || st === 422 || st === 0)) await sleep(1500);
        s = await load();
      }
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  }, [load, router]);

  useEffect(() => {
    alive.current = true;
    if (wanted.current) void drive();
    const online = () => {
      setOffline(false);
      if (wanted.current) void drive();
    };
    // phones pause a background tab's timers and requests; carry on as soon as it's back
    const visible = () => {
      if (document.visibilityState === "visible" && wanted.current) void drive();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive.current = false;
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [drive]);

  const resume = useCallback(() => {
    wanted.current = true;
    setPaused(false);
    void drive();
  }, [drive]);

  const pause = useCallback(() => {
    wanted.current = false;
    setPaused(true);
  }, []);

  return { state, running, paused, offline, stalled, resume, pause, reload: load };
}
