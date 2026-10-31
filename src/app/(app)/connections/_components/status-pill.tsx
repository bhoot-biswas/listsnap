import { useTranslations } from "next-intl";
import type { ServiceStatus } from "@/lib/connectors";
import { cn } from "@/lib/utils";

const STYLE: Record<ServiceStatus, string> = {
  connected: "bg-success/15 text-success",
  broken: "bg-destructive/10 text-destructive",
  demo: "bg-primary-soft text-primary",
  test: "bg-primary-soft text-primary",
  none: "bg-muted text-muted-foreground",
};

/** How a connection is doing, in the same words on the list and its detail page. */
export function StatusPill({ status, className }: { status: ServiceStatus; className?: string }) {
  const t = useTranslations("connections.status");
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        STYLE[status],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
