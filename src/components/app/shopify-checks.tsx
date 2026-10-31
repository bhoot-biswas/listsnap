import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { ShopifyCheck } from "@/lib/shopify-connection";
import { cn } from "@/lib/utils";

const ICON = { pass: CircleCheck, warn: CircleAlert, fail: CircleX };
const TONE = { pass: "text-success", warn: "text-warning", fail: "text-destructive" };

/** The Shopify checks, each with what to do underneath when it didn't pass. */
export function ShopifyChecks({ checks, className }: { checks: ShopifyCheck[]; className?: string }) {
  const t = useTranslations("connections.shopifyCard");
  return (
    <ul className={cn("space-y-2", className)}>
      {checks.map((c) => {
        const Icon = ICON[c.status];
        return (
          <li key={c.id} className="flex gap-2 text-sm">
            <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[c.status])} aria-hidden="true" />
            <div>
              <p>{t(`checks.${c.id}.${c.status as "pass"}`)}</p>
              {c.status !== "pass" && c.reason && <p className="text-muted-foreground">{t(`reasons.${c.reason}`)}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
