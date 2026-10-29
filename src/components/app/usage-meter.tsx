import { useFormatter } from "next-intl";
import { cn } from "@/lib/utils";

/** One daily limit as a bar (Dashboard, Usage). Marigold from 90%, so the limit isn't a surprise. */
export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const format = useFormatter();
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {format.number(used)}/{format.number(limit)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", pct >= 90 ? "bg-warning" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** When the daily limits start again: the next midnight UTC. */
export function nextReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
