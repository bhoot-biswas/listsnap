import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ListingStatus = "processing" | "needs_review" | "ready" | "in_store" | "posted" | "failed";

const STYLE: Record<ListingStatus, string> = {
  processing: "bg-muted text-muted-foreground",
  needs_review: "bg-marigold-soft text-warning",
  ready: "border border-success/50 text-success",
  in_store: "bg-success/15 text-success",
  posted: "bg-primary-soft text-primary",
  failed: "bg-destructive/10 text-destructive",
};

/** The one set of status words and colours used everywhere. */
export function StatusBadge({ status, className }: { status: ListingStatus; className?: string }) {
  const t = useTranslations("status");
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        STYLE[status],
        className,
      )}
    >
      {status === "processing" && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
      {t(status)}
    </span>
  );
}
