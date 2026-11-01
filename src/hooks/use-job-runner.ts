"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobState, StepView } from "@/lib/job-state";
import { loadState } from "./load-state";
import { useDoneCue } from "./use-done-cue";
import { useWakeLock } from "./use-wake-lock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives a job through its steps from the browser. The server says what to
 * call next (`state.next`); this hook calls those, then reloads the state, until
 * nothing is left. Because every decision comes from saved state, a refresh or a
 * second tab simply picks up where things are: finished steps aren't repeated, and a
 * step another tab is running answers 202 until it's done.
 */
export function useJobRunner(initial: JobState) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [offline, setOffline] = useState(false);
  /** The job's state couldn't be loaded, so nothing will move until the seller tries again. */
  const [stalled, setStalled] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const id = initial.id;

  // while steps are left, a locked screen would freeze them; once none are, say so
  useWakeLock(state.next.length > 0 && !offline);
  useDoneCue(state.next.length ? false : state.status === "ready" ? "ready" : "needs-you");

  const load = useCallback(async (): Promise<JobState | null> => {
    const r = await loadState<JobState>(`/api/jobs/${id}`);
    if ("error" in r) {
      if (r.error === "signed-out") router.push("/sign-in");
      // without a state there's nothing to call next; say so instead of spinning forever
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
    try {
      let s = await load();
      while (alive.current && s && s.next.length) {
        if (!navigator.onLine) {
          setOffline(true);
          return;
        }
        const statuses = await Promise.all(
          s.next.map((c) =>
            fetch(c.url, { method: "POST" })
              .then((r) => r.status)
              .catch(() => 0),
          ),
        );
        if (statuses.includes(401)) {
          router.push("/sign-in");
          return;
        }
        // 202: another request holds the lock; 422 or a network error: retry after a pause
        const pause = statuses.some((st) => st === 202)
          ? 1500
          : statuses.some((st) => st === 422 || st === 0)
            ? 2000
            : 0;
        if (pause) await sleep(pause);
        s = await load();
      }
    } finally {
      busy.current = false;
    }
  }, [load, router]);

  useEffect(() => {
    alive.current = true;
    void drive();
    const online = () => {
      setOffline(false);
      void drive();
    };
    // phones pause a background tab's timers and requests; carry on as soon as it's back
    const visible = () => {
      if (document.visibilityState === "visible") void drive();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive.current = false;
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [drive]);

  /** "Try again" on a step that ran out of attempts. A dropped request leaves the button ready to tap again. */
  const retry = useCallback(
    async (step: StepView) => {
      const res = await fetch(retryUrl(id, step), { method: "POST" }).catch(() => null);
      if (res?.status === 401) return router.push("/sign-in");
      if (!res) setStalled(navigator.onLine);
      await drive();
    },
    [id, drive, router],
  );

  /** The seller's answer on Choose items. */
  const choose = useCallback(
    async (mode: string, keepItemIds: string[]) => {
      const res = await fetch(`/api/jobs/${id}/choice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, keepItemIds }),
      }).catch(() => null);
      if (res?.status === 401) {
        router.push("/sign-in");
        return false;
      }
      await drive();
      return !!res?.ok;
    },
    [id, drive, router],
  );

  return { state, offline, stalled, retry, choose, resume: drive };
}

export function retryUrl(jobId: string, s: Pick<StepView, "step" | "target">): string {
  if (s.target === "-") return `/api/jobs/${jobId}/steps/${s.step}?retry=1`;
  const [listingId, scene] = s.target.split(":");
  return `/api/listings/${listingId}/steps/${s.step}?${scene ? `scene=${scene}&` : ""}retry=1`;
}
