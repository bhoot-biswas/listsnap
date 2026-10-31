import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/app/form-buttons";

/**
 * The store's myshopify.com address, then off to Shopify to approve ListSnap. A plain GET
 * to the install route, not a server action: the browser itself must follow the redirects
 * to Shopify and back, so the one-time state cookie is spent by that one visit. The route
 * checks the address and comes back with ?shopify=shop when it isn't one.
 */
export async function ShopifyConnectForm({
  next,
  label,
}: {
  next: "onboarding" | "connections";
  /** "Connect again" on a broken connection. */
  label?: string;
}) {
  const t = await getTranslations("connections.shopifyCard");
  return (
    <form method="get" action="/api/shopify/install" className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor={`shopify-shop-${next}`}>{t("shop")}</Label>
        <Input
          id={`shopify-shop-${next}`}
          name="shop"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder={t("shopPlaceholder")}
          aria-describedby={`shopify-shop-hint-${next}`}
          className="h-11"
        />
        <p id={`shopify-shop-hint-${next}`} className="text-xs text-muted-foreground">
          {t("shopHint")}
        </p>
      </div>
      <PendingButton size="lg">{label ?? t("connect")}</PendingButton>
    </form>
  );
}
