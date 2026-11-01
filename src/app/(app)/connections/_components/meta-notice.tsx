import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

// what /api/meta/install and /callback report back with ?meta=
const NOTICES = ["connected", "demo", "denied", "expired", "noPages", "failed"] as const;

/** How connecting Facebook went, on whichever page the seller lands. */
export async function MetaNotice({ value }: { value: unknown }) {
  const notice = NOTICES.find((n) => n === value);
  if (!notice) return null;
  const t = await getTranslations("connections.meta");
  return (
    <p
      role="status"
      className={cn(
        "rounded-xl border p-4 text-sm",
        notice === "connected" ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
      )}
    >
      {notice === "connected" ? t("connected") : t(`errors.${notice}`)}
    </p>
  );
}
