import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { WooCheck } from "@/lib/woo-connection";
import { cn } from "@/lib/utils";

const ICON = { pass: CircleCheck, warn: CircleAlert, fail: CircleX };
const TONE = { pass: "text-success", warn: "text-warning", fail: "text-destructive" };

/** The store checks, each with its fix underneath when it didn't pass. */
export function WooChecks({ checks, className }: { checks: WooCheck[]; className?: string }) {
  const t = useTranslations("connect");
  return (
    <ul className={cn("space-y-2", className)}>
      {checks.map((c) => {
        const Icon = ICON[c.status];
        return (
          <li key={c.id} className="flex gap-2 text-sm">
            <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[c.status])} aria-hidden="true" />
            <div>
              <p>{t(`checks.${c.id}.${c.status}`)}</p>
              {c.status === "fail" && c.reason && <p className="text-muted-foreground">{t(`reasons.${c.reason}`)}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
