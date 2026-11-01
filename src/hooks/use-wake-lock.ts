"use client";

import { useEffect } from "react";

/**
 * Keeps the phone's screen on while `active`. The browser drives every step, and a
 * locked screen freezes the tab, so a listing would sit half made until the seller came
 * back. The lock lapses whenever the tab is hidden, so it's taken again on return.
 * Browsers without the Wake Lock API, or that refuse it (low battery), just carry on.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const take = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      lock = await navigator.wakeLock.request("screen").catch(() => null);
      if (!lock) return;
      if (done) void lock.release();
      else lock.addEventListener("release", () => void (lock = null));
    };
    const visible = () => void take();
    void take();
    document.addEventListener("visibilitychange", visible);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", visible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
