import { getTranslations } from "next-intl/server";
import { connectShopifyDemo } from "@/server/actions/shopify-connection";

/** "No Shopify store yet? Use the demo store for now." */
export async function ShopifyDemoButton({ next }: { next: "onboarding" | "connections" }) {
  const t = await getTranslations("connections.shopifyCard");
  return (
    <form action={connectShopifyDemo}>
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline">
        {t("demo")}
      </button>
    </form>
  );
}
