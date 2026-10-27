"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** `N` opens New listing from anywhere. The rest of the list arrives in Phase 7. */
export function KeyboardShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push("/snap");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
