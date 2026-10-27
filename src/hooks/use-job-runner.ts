"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobState, StepView } from "@/lib/job-state";

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
  const busy = useRef(false);
  const alive = useRef(true);
  const id = initial.id;

  const load = useCallback(async (): Promise<JobState | null> => {
    const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
    if (res.status === 401) {
      router.push("/sign-in");
      return null;
    }
    if (!res.ok) return null;
    const next = (await res.json()) as JobState;
    if (alive.current) setState(next);
    return next;
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
    window.addEventListener("online", online);
    return () => {
      alive.current = false;
      window.removeEventListener("online", online);
    };
  }, [drive]);

  /** "Try again" on a step that ran out of attempts. */
  const retry = useCallback(
    async (step: StepView) => {
      await fetch(retryUrl(id, step), { method: "POST" });
      await drive();
    },
    [id, drive],
  );

  /** The seller's answer on Choose items. */
  const choose = useCallback(
    async (mode: string, keepItemIds: string[]) => {
      const res = await fetch(`/api/jobs/${id}/choice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, keepItemIds }),
      });
      await drive();
      return res.ok;
    },
    [id, drive],
  );

  return { state, offline, retry, choose };
}

export function retryUrl(jobId: string, s: Pick<StepView, "step" | "target">): string {
  if (s.target === "-") return `/api/jobs/${jobId}/steps/${s.step}?retry=1`;
  const [listingId, scene] = s.target.split(":");
  return `/api/listings/${listingId}/steps/${s.step}?${scene ? `scene=${scene}&` : ""}retry=1`;
}
