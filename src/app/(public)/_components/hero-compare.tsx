"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Where the divider rests between moves of the one-off sweep that shows it can be dragged. */
const SWEEP = [78, 24, 55];

/**
 * The phone photo over the studio photo with a divider between them. It sweeps once on
 * load so visitors see what it is, then belongs to them; a real range input underneath
 * keeps it usable by keyboard and screen reader.
 */
export function HeroCompare() {
  const t = useTranslations("landing.hero");
  const tJob = useTranslations("job");
  const tCommon = useTranslations("common");
  const [split, setSplit] = useState(50);
  const [sweeping, setSweeping] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const list = timers.current;
    list.push(setTimeout(() => setSweeping(true), 0));
    SWEEP.forEach((at, i) => list.push(setTimeout(() => setSplit(at), 700 + i * 900)));
    list.push(setTimeout(() => setSweeping(false), 700 + SWEEP.length * 900));
    return () => list.forEach(clearTimeout);
  }, []);

  const take = (value: number) => {
    timers.current.forEach(clearTimeout);
    setSweeping(false);
    setSplit(value);
  };

  return (
    <figure className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/40 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/60">
      <Image
        src="/samples/saree-studio.jpg"
        alt={t("studioAlt")}
        fill
        sizes="(min-width: 768px) 520px, 92vw"
        loading="eager"
        className="object-cover"
      />
      <Image
        src="/samples/saree.jpg"
        alt={t("photoAlt")}
        fill
        sizes="(min-width: 768px) 520px, 92vw"
        loading="eager"
        fetchPriority="high"
        className={cn("object-cover", sweeping && "transition-[clip-path] duration-700 ease-in-out")}
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_12px_rgba(0,0,0,0.4)]",
          sweeping && "transition-[left] duration-700 ease-in-out",
        )}
        style={{ left: `${split}%` }}
      >
        <span className="absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full bg-white text-neutral-900 shadow-lg">
          <ChevronsLeftRight className="size-5" />
        </span>
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white">
        {tJob("before")}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white">
        {tJob("after")}
      </span>
      <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-marigold-soft px-2.5 py-0.5 text-xs font-medium text-warning">
        {tCommon("aiBackground")}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => take(Number(e.target.value))}
        aria-label={t("compare")}
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </figure>
  );
}
