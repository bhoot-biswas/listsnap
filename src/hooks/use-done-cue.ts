"use client";

import { useEffect, useRef } from "react";

/**
 * Tells a seller who switched to another app or tab that the work has finished: a mark
 * in front of the tab title (✓ done, ● needs you) and a short buzz on phones that allow
 * it. The title is put back as soon as they look at the page again.
 */
export function useDoneCue(done: false | "ready" | "needs-you") {
  const was = useRef(done);
  useEffect(() => {
    const before = was.current;
    was.current = done;
    if (!done || before === done || document.visibilityState === "visible") return;
    const title = document.title;
    document.title = `${done === "ready" ? "✓" : "●"} ${title}`;
    navigator.vibrate?.(200);
    const back = () => {
      if (document.visibilityState !== "visible") return;
      document.title = title;
      document.removeEventListener("visibilitychange", back);
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      document.title = title;
    };
  }, [done]);
}
