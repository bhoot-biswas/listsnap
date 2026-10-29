"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CloudOff, Wifi } from "lucide-react";

/**
 * A slim banner while the connection is down, and a short "back online" after. Pages
 * keep their own handling (Review's autosave waits, the job runner pauses); this just
 * tells the seller why nothing is moving, on every page at once.
 */
export function OfflineBanner() {
  const t = useTranslations("offline");
  const [state, setState] = useState<"online" | "offline" | "back">("online");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const online = () => {
      setState((s) => (s === "offline" ? "back" : s));
      timer = setTimeout(() => setState("online"), 3000);
    };
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  return (
    <div aria-live="polite">
      {state !== "online" && (
        <p
          className={
            state === "offline"
              ? "flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-center text-sm text-background"
              : "flex items-center justify-center gap-2 bg-success/15 px-4 py-2 text-center text-sm text-success"
          }
        >
          {state === "offline" ? (
            <CloudOff className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Wifi className="size-4 shrink-0" aria-hidden="true" />
          )}
          {t(state)}
        </p>
      )}
    </div>
  );
}
