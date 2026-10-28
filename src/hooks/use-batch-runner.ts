"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BatchState } from "@/lib/batch-state";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jobs worked on at once: Muse Image's 150 images a minute sets the pace. */
export const JOBS_AT_ONCE = 2;

/**
 * Drives a bulk batch from the browser, two photos at a time. Like the single-job
 * runner it only makes the calls the server lists as next, so pausing, a refresh or a
 * second tab never repeats finished work. Closing the tab pauses the batch; it starts
 * by itself only right after the upload (`autoStart`), otherwise it waits for Resume.
 */
export function useBatchRunner(initial: BatchState, autoStart: boolean) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [running, setRunning] = useState(false);
  const wanted = useRef(autoStart);
  const busy = useRef(false);
  const alive = useRef(true);
  const id = initial.id;

  const load = useCallback(async (): Promise<BatchState | null> => {
    const res = await fetch(`/api/batches/${id}`, { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) {
      router.push("/sign-in");
      return null;
    }
    if (!res?.ok) return null;
    const next = (await res.json()) as BatchState;
    if (alive.current) setState(next);
    return next;
  }, [id, router]);

  const drive = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    try {
      let s = await load();
      while (alive.current && wanted.current && s) {
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
    return () => {
      alive.current = false;
    };
  }, [drive]);

  const resume = useCallback(() => {
    wanted.current = true;
    void drive();
  }, [drive]);

  const pause = useCallback(() => {
    wanted.current = false;
  }, []);

  return { state, running, resume, pause, reload: load };
}
