import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

// what /api/shopify/install and /callback report back with ?shopify=
const NOTICES = ["connected", "shop", "demo", "denied", "expired", "scopes", "taken", "failed"] as const;

/** How connecting Shopify went, on whichever page the seller lands. */
export async function ShopifyNotice({ value }: { value: unknown }) {
  const notice = NOTICES.find((n) => n === value);
  if (!notice) return null;
  const t = await getTranslations("connections.shopifyCard");
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
