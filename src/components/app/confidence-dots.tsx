import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** AI confidence as five dots and a word; never a raw percentage. Marigold below 0.7, like Needs review. */
export function ConfidenceDots({ confidence, className }: { confidence: number | null; className?: string }) {
  const t = useTranslations("review");
  const c = confidence ?? 0;
  const dots = Math.max(1, Math.round(c * 5));
  const level = c < 0.5 ? "low" : c < 0.7 ? "fair" : c < 0.85 ? "good" : "great";
  return (
    <span className={cn("flex items-center gap-2 text-sm", className)}>
      <span className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn("size-2.5 rounded-full", i <= dots ? (c < 0.7 ? "bg-warning" : "bg-success") : "bg-muted")}
          />
        ))}
      </span>
      {t(`confidenceLevel.${level}`)}
    </span>
  );
}
